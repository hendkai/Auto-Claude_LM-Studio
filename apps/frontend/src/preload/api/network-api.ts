import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';

export interface Peer {
    id: string;
    ip: string;
    port: number;
    hostname: string;
    lastSeen: number;
}

export interface NetworkAPI {
    network: {
        getPeers: () => Promise<Peer[]>;
        getEnabled: () => Promise<boolean>;
        setEnabled: (enabled: boolean) => Promise<boolean>;
        triggerSync: () => Promise<number>;
        onPeerDiscovered: (callback: (peer: Peer) => void) => () => void;
    }
}

export const createNetworkAPI = (): NetworkAPI => ({
    network: {
        getPeers: () => ipcRenderer.invoke(IPC_CHANNELS.NETWORK_GET_PEERS),
        getEnabled: () => ipcRenderer.invoke(IPC_CHANNELS.NETWORK_GET_ENABLED),
        setEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.NETWORK_SET_ENABLED, enabled),
        triggerSync: () => ipcRenderer.invoke(IPC_CHANNELS.NETWORK_TRIGGER_SYNC),
        onPeerDiscovered: (callback) => {
            const handler = (_: any, peer: Peer) => callback(peer);
            ipcRenderer.on(IPC_CHANNELS.NETWORK_PEER_DISCOVERED, handler);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.NETWORK_PEER_DISCOVERED, handler);
        }
    }
});
