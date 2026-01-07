const dgram = require('dgram');
const { networkInterfaces } = require('os');
const { EventEmitter } = require('events');
const crypto = require('crypto');

// Simplified UUID
const uuidv4 = () => crypto.randomUUID();

class NetworkDiscovery extends EventEmitter {
    constructor(port) {
        super();
        this.broadcastPort = port;
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.deviceId = uuidv4();
        this.hostname = process.env.HOSTNAME || 'Debug-Standalone';
        this.isRunning = false;

        this.setupSocket();
    }

    setupSocket() {
        this.socket.on('error', (err) => {
            console.error(`[NetworkDiscovery] Socket error:\n${err.stack}`);
            this.socket.close();
        });

        this.socket.on('message', (msg, rinfo) => {
            this.handleMessage(msg, rinfo);
        });

        this.socket.on('listening', () => {
            const address = this.socket.address();
            console.log(`[NetworkDiscovery] Listening on ${address.address}:${address.port}`);
            this.socket.setBroadcast(true);
        });
    }

    start() {
        this.socket.bind(this.broadcastPort, () => {
            this.isRunning = true;
            this.startBroadcasting();
        });
    }

    startBroadcasting() {
        // Broadcast immediately
        this.broadcastMessage({
            type: 'HELLO',
            id: this.deviceId,
            port: 1111,
            hostname: this.hostname
        });

        // And again in 1s
        setTimeout(() => this.startBroadcasting(), 1000);
    }

    broadcastMessage(message) {
        const msg = Buffer.from(JSON.stringify(message));
        const broadcastAddresses = this.getBroadcastAddresses();
        console.log('Broadcasting to:', broadcastAddresses);

        broadcastAddresses.forEach(addr => {
            this.socket.send(msg, 0, msg.length, this.broadcastPort, addr, (err) => {
                if (err) console.error('Send error:', err);
            });
        });
    }

    handleMessage(msg, rinfo) {
        try {
            const message = JSON.parse(msg.toString());
            // console.log('Received:', message);

            if (message.id === this.deviceId) return; // Ignore self

            if (message.type === 'HELLO') {
                console.log(`[NetworkDiscovery] Found peer: ${message.hostname} (${rinfo.address})`);
            }
        } catch (err) {
            console.error('Parse error', err);
        }
    }

    getBroadcastAddresses() {
        const addresses = [];
        const interfaces = networkInterfaces();

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    addresses.push('255.255.255.255');
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

// Run listening on 54322 (different port to avoid conflict if any)
const discovery = new NetworkDiscovery(54322);
discovery.start();

// Keep running
setInterval(() => { }, 1000);
