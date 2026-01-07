const dgram = require('dgram');
const socket = dgram.createSocket('udp4');

const PORT = 54321;
const BROADCAST_ADDR = '255.255.255.255';
const SUBNET_BROADCAST = '192.168.178.255';

const message = JSON.stringify({
    type: 'HELLO',
    id: 'debug-peer-' + Math.floor(Math.random() * 10000),
    port: 8080,
    hostname: 'Debug-Script-Host'
});

socket.bind(() => {
    socket.setBroadcast(true);
    console.log('Sending broadcast...');

    // Send to global broadcast
    socket.send(message, 0, message.length, PORT, BROADCAST_ADDR, (err) => {
        if (err) console.error('Global broadcast error:', err);
        else console.log('Sent to ' + BROADCAST_ADDR);
    });

    // Send to subnet broadcast
    socket.send(message, 0, message.length, PORT, SUBNET_BROADCAST, (err) => {
        if (err) console.error('Subnet broadcast error:', err);
        else console.log('Sent to ' + SUBNET_BROADCAST);

        socket.close();
    });
});
