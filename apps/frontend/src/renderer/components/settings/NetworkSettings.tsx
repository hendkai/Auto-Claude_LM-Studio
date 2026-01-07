import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { RefreshCw, Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// @ts-ignore - Import might fail if path alias not set, but type check should pass if file exists
import type { Peer } from '../../../preload/api/network-api';

export function NetworkSettings() {
    const { t } = useTranslation('settings');
    const [enabled, setEnabled] = useState(false);
    const [peers, setPeers] = useState<Peer[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        // Fetch initial state
        window.electronAPI.network.getEnabled().then(e => {
            setEnabled(e);
            if (e) fetchPeers();
        });

        // Listen for discoveries
        const cleanup = window.electronAPI.network.onPeerDiscovered((peer: Peer) => {
            setPeers(prev => {
                if (prev.find(p => p.id === peer.id)) return prev;
                return [...prev, peer];
            });
        });

        return cleanup;
    }, []);

    const fetchPeers = async () => {
        try {
            const p = await window.electronAPI.network.getPeers();
            setPeers(p);
        } catch (e) {
            console.error("Failed to fetch peers", e);
        }
    };

    const handleToggle = async (chk: boolean) => {
        setEnabled(chk);
        await window.electronAPI.network.setEnabled(chk);
        if (chk) fetchPeers();
        else setPeers([]);
    };

    const handleSync = async () => {
        setIsSyncing(true);
        await window.electronAPI.network.triggerSync();
        fetchPeers();
        setTimeout(() => setIsSyncing(false), 1000);
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-medium">{t('network.title')}</h2>
                <p className="text-sm text-muted-foreground">{t('network.description')}</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 bg-card">
                <div className="space-y-0.5">
                    <label className="text-base font-medium">{t('network.enable.label')}</label>
                    <p className="text-sm text-muted-foreground">{t('network.enable.description')}</p>
                </div>
                <Switch checked={enabled} onCheckedChange={handleToggle} />
            </div>

            {enabled && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">{t('network.peers.title')} ({peers.length})</h3>
                        <Button variant="ghost" size="sm" onClick={handleSync} disabled={isSyncing}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                            {t('network.actions.syncNow')}
                        </Button>
                    </div>

                    <div className="grid gap-4">
                        {peers.length === 0 ? (
                            <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground bg-muted/20">
                                <div className="flex justify-center mb-3">
                                    <Network className="h-8 w-8 opacity-50" />
                                </div>
                                <p>{t('network.peers.noPeers')}</p>
                                <p className="text-xs mt-1">{t('network.peers.checkNetwork')}</p>
                            </div>
                        ) : (
                            peers.map(peer => (
                                <Card key={peer.id}>
                                    <CardContent className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-primary/10 rounded-full">
                                                <Network className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <div className="font-medium">{peer.hostname || t('network.peers.unknownHost')}</div>
                                                <div className="text-xs text-muted-foreground font-mono">{peer.ip}:{peer.port}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant="outline" className="text-xs">
                                                {t('network.peers.connected')}
                                            </Badge>
                                            <div className="text-[10px] text-muted-foreground mt-1">
                                                {t('network.peers.lastSeen')}: {new Date(peer.lastSeen).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
