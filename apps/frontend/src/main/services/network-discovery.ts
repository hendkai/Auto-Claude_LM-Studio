import dgram from 'dgram';
import { networkInterfaces } from 'os';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

interface Peer {
    id: string;
    ip: string;
    port: number; // Sync service port (HTTP)
    hostname: string;
    lastSeen: number;
}

export class NetworkDiscovery extends EventEmitter {
    private socket: dgram.Socket;
    private broadcastPort = 54321;
    private syncPort: number;
    private intervalId: NodeJS.Timeout | null = null;
    private peers: Map<string, Peer> = new Map();
    private deviceId: string;
    private hostname: string;
    private isRunning = false;

    constructor(syncPort: number) {
        super();
        this.syncPort = syncPort;
        this.socket = dgram.createSocket('udp4');

        // Generate a session ID. For persistent identity we'd need to save this to a config file.
        // For now, a session ID is sufficient to distinguish "me" from "others"
        this.deviceId = uuidv4();

        // Get hostname usually from os.hostname(), but we can just use a random suffix if needed
        // or just rely on what we can find. simpler:
        this.hostname = process.env.COMPUTERNAME || process.env.HOSTNAME || 'Unknown Device';

        this.setupSocket();
    }

    private setupSocket() {
        this.socket.on('error', (err) => {
            console.error(`[NetworkDiscovery] Socket error:\n${err.stack}`);
            this.socket.close();
        });

        this.socket.on('message', (msg, rinfo) => {
            this.handleMessage(msg, rinfo);
        });

        this.socket.on('listening', () => {
            try {
                const address = this.socket.address();
                console.log(`[NetworkDiscovery] Listening on ${address.address}:${address.port}`);
                this.socket.setBroadcast(true);
            } catch (e) {
                console.error('[NetworkDiscovery] Error in listening handler', e);
            }
        });
    }

    public start() {
        if (this.isRunning) return;

        try {
            this.socket.bind(this.broadcastPort, () => {
                this.isRunning = true;
                this.startBroadcasting();
                this.startPruning();
            });
        } catch (error) {
            console.warn('[NetworkDiscovery] Failed to bind to broadcast port', error);
            // Maybe try to act as a client only if we can't bind? 
            // For now, assume we can bind.
        }
    }

    public stop() {
        this.isRunning = false;
        if (this.intervalId) clearInterval(this.intervalId);

        // Send BYE message
        this.broadcastMessage({ type: 'BYE', id: this.deviceId });

        try {
            this.socket.close();
        } catch (e) {
            // ignore
        }
    }

    public getPeers(): Peer[] {
        return Array.from(this.peers.values());
    }

    private startBroadcasting() {
        this.intervalId = setInterval(() => {
            this.broadcastMessage({
                type: 'HELLO',
                id: this.deviceId,
                port: this.syncPort,
                hostname: this.hostname
            });
        }, 5000);

        // broadcast immediately
        this.broadcastMessage({
            type: 'HELLO',
            id: this.deviceId,
            port: this.syncPort,
            hostname: this.hostname
        });
    }

    private broadcastMessage(message: any) {
        const msg = Buffer.from(JSON.stringify(message));
        // Calculate broadcast addresses for all interfaces
        const broadcastAddresses = this.getBroadcastAddresses();

        broadcastAddresses.forEach(addr => {
            try {
                this.socket.send(msg, 0, msg.length, this.broadcastPort, addr);
            } catch (e) {
                // ignore network unreachable
            }
        });
    }

    private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo) {
        try {
            const message = JSON.parse(msg.toString());

            // Ignore own messages
            if (message.id === this.deviceId) return;

            if (message.type === 'HELLO') {
                const peer: Peer = {
                    id: message.id,
                    ip: rinfo.address,
                    port: message.port,
                    hostname: message.hostname,
                    lastSeen: Date.now()
                };

                const isNew = !this.peers.has(peer.id);
                this.peers.set(peer.id, peer);

                if (isNew) {
                    console.log(`[NetworkDiscovery] Found peer: ${peer.hostname} (${peer.ip})`);
                    this.emit('peer-discovered', peer);
                } else {
                    this.emit('peer-updated', peer);
                }
            } else if (message.type === 'BYE') {
                if (this.peers.has(message.id)) {
                    console.log(`[NetworkDiscovery] Peer left: ${message.id}`);
                    this.peers.delete(message.id);
                    this.emit('peer-lost', message.id);
                }
            }
        } catch (err) {
            // ignore invalid json
        }
    }

    private startPruning() {
        setInterval(() => {
            const now = Date.now();
            for (const [id, peer] of this.peers.entries()) {
                if (now - peer.lastSeen > 15000) { // 15 seconds timeout
                    console.log(`[NetworkDiscovery] Peer timed out: ${peer.hostname}`);
                    this.peers.delete(id);
                    this.emit('peer-lost', id);
                }
            }
        }, 5000);
    }

    private getBroadcastAddresses(): string[] {
        const addresses: string[] = [];
        const interfaces = networkInterfaces();

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]!) {
                // Skip internal (127.0.0.1) and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    // Calculate broadcast address
                    // Simple approximation: assuming /24 subnet for local networks usually
                    // Or strictly use 255.255.255.255
                    addresses.push('255.255.255.255');

                    // Also try subnet specific broadcast if possible, but 255.255.255.255 usually works on local segment
                    // A more robust way would be calculating bitwise OR of IP and inverted netmask
                    if (iface.netmask && iface.address) {
                        const parts = iface.address.split('.').map(Number);
                        const mask = iface.netmask.split('.').map(Number);
                        const broadcast = parts.map((part, i) => (part | (~mask[i] & 0xFF))).join('.');
                        addresses.push(broadcast);
                    }
                }
            }
        }
        return [...new Set(addresses)];
    }
}
