// --- START OF FILE server.js ---

const WebSocket = require('ws');
const http = require('http');
const url = require('url'); // Do parsowania URL w żądaniu HTTP

// Konfiguracja portu i hosta
// Możesz ustawić zmienne środowiskowe PORT i HOST, np. PORT=3000 HOST=0.0.0.0 node server.js
// Domyślnie: localhost:8080
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0'; // Nasłuchuj na wszystkich interfejsach

// Tworzymy serwer HTTP
const httpServer = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);

    // Obsługa żądania GET na ścieżce '/' (lub innej, jeśli reverse proxy tak mapuje)
    if (req.method === 'GET' && (parsedUrl.pathname === '/' || parsedUrl.pathname === '/PA1/')) { // Obsługa /PA1/ jeśli reverse proxy jest tak skonfigurowane
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        let htmlResponse = `
            <!DOCTYPE html>
            <html lang="pl">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="refresh" content="5">
                <title>Podłączeni użytkownicy</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
                    h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 15px rgba(0,0,0,0.1); }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background-color: #007bff; color: white; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                    tr:hover { background-color: #f1f1f1; }
                    .no-users { text-align: center; font-style: italic; color: #777; padding: 20px; }
                </style>
            </head>
            <body>
                <h1>Lista podłączonych użytkowników WebSocket</h1>
        `;

        if (clients.size === 0) {
            htmlResponse += '<p class="no-users">Brak podłączonych użytkowników.</p>';
        } else {
            htmlResponse += `
                <table>
                    <thead>
                        <tr>
                            <th>UUID</th>
                            <th>Nazwa użytkownika</th>
                            <th>Szerokość (Lat)</th>
                            <th>Długość (Lng)</th>
                            <th>Ostatnia aktywność</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            clients.forEach((userData) => {
                htmlResponse += `
                    <tr>
                        <td>${userData.uuid}</td>
                        <td>${userData.userName}</td>
                        <td>${userData.lat.toFixed(6)}</td>
                        <td>${userData.lng.toFixed(6)}</td>
                        <td>${userData.lastSeen.toLocaleString('pl-PL')}</td>
                    </tr>
                `;
            });
            htmlResponse += `
                    </tbody>
                </table>
            `;
        }
        htmlResponse += `
                <p style="margin-top: 20px; font-size: 0.9em; color: #555;">
                    Strona odświeża się automatycznie co 5 sekund.
                </p>
            </body>
            </html>
        `;
        res.end(htmlResponse);
    } else {
        // Dla innych ścieżek zwracamy 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Tworzymy serwer WebSocket i dowiązujemy go do serwera HTTP
// Opcja `noServer: true` lub przekazanie `server: httpServer` pozwala na współdzielenie portu
const wss = new WebSocket.Server({ server: httpServer });

// Przechowujemy klientów jako Map, gdzie kluczem jest obiekt WebSocket,
// a wartością są dane użytkownika (uuid, userName, lat, lng, lastSeen)
const clients = new Map();

// Serwer HTTP nasłuchuje
httpServer.listen(PORT, HOST, () => {
    console.log(`Serwer HTTP i WebSocket nasłuchuje na http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`);
    console.log(`Strona statusu dostępna pod adresem: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`);
    console.log(`Klienci WebSocket powinni łączyć się z: ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`(lub wss://twojadomena.pl/PA1/ jeśli używasz reverse proxy z SSL i mapowaniem ścieżki)`);
});


wss.on('connection', (ws, req) => { // req jest dostępne, jeśli wss jest powiązany z serwerem HTTP
    // Możesz użyć req.socket.remoteAddress do logowania IP, jeśli potrzebujesz
    console.log(`Nowy klient połączony z IP: ${req.socket.remoteAddress}`);

    // Kiedy klient wysyła wiadomość
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // console.log('Odebrano dane:', data);

            // Wymagane pola
            if (!data.uuid || !data.userName || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
                console.warn('Odebrano niekompletne dane:', data);
                ws.send(JSON.stringify({ type: 'error', message: 'Niekompletne dane. Wymagane: uuid, userName, lat, lng.' }));
                return;
            }

            const clientData = {
                uuid: data.uuid,
                userName: data.userName,
                lat: data.lat,
                lng: data.lng,
                lastSeen: new Date() // Dodajemy czas ostatniej aktywności
            };

            // Zapisz/zaktualizuj dane klienta
            clients.set(ws, clientData);

            // Rozgłoś informację o tym użytkowniku do wszystkich INNYCH klientów
            broadcastUserInfo(clientData, ws);

            // Jeśli to pierwsze połączenie tego klienta (lub pierwsze dane)
            // wyślij mu listę wszystkich aktualnie podłączonych użytkowników (oprócz niego samego)
            if (!ws.hasReceivedInitialList) {
                const allOtherUsers = [];
                clients.forEach((userData, clientWs) => {
                    if (clientWs !== ws) { // Nie wysyłaj danych samego siebie
                        allOtherUsers.push(userData);
                    }
                });
                if (allOtherUsers.length > 0) {
                    ws.send(JSON.stringify({ type: 'all_users', users: allOtherUsers }));
                }
                ws.hasReceivedInitialList = true; // Oznacz, że lista została wysłana
            }

        } catch (error) {
            console.error('Błąd przetwarzania wiadomości:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Błąd przetwarzania wiadomości JSON.' }));
        }
    });

    // Kiedy klient się rozłącza
    ws.on('close', () => {
        const disconnectedUser = clients.get(ws);
        if (disconnectedUser) {
            console.log(`Klient ${disconnectedUser.userName} (UUID: ${disconnectedUser.uuid}) rozłączony.`);
            clients.delete(ws);
            // Poinformuj pozostałych klientów o rozłączeniu
            broadcast({ type: 'user_disconnected', uuid: disconnectedUser.uuid });
        } else {
            console.log('Klient rozłączony (brak danych).');
        }
    });

    ws.on('error', (error) => {
        console.error('Błąd WebSocket:', error);
        // Można tu też obsłużyć rozłączenie, jeśli 'close' nie zostanie wywołane
        const disconnectedUserOnError = clients.get(ws);
        if (disconnectedUserOnError) {
            console.log(`Klient ${disconnectedUserOnError.userName} (UUID: ${disconnectedUserOnError.uuid}) rozłączony z powodu błędu.`);
            clients.delete(ws);
            broadcast({ type: 'user_disconnected', uuid: disconnectedUserOnError.uuid });
        }
    });
});

// Funkcja do rozgłaszania informacji o użytkowniku (jego aktualizacji)
function broadcastUserInfo(userData, sender) {
    // Tworzymy kopię obiektu bez pola lastSeen dla transmisji, jeśli nie chcesz go wysyłać
    // lub wysyłamy całość, jeśli klient ma z niego korzystać
    const { lastSeen, ...userUpdateData } = userData; // Przykład pominięcia lastSeen
    // Jeśli chcesz wysłać lastSeen, użyj: const messageData = { type: 'user_update', user: userData };
    const messageData = { type: 'user_update', user: userUpdateData }; // Wysyłamy bez lastSeen do innych klientów
                                                                        // Jeśli chcesz, aby klienci znali lastSeen innych, użyj:
                                                                        // const messageData = { type: 'user_update', user: userData };

    const message = JSON.stringify(messageData);
    wss.clients.forEach((client) => {
        // Wysyłaj do wszystkich oprócz nadawcy, którzy są gotowi
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Funkcja do ogólnego rozgłaszania (np. o rozłączeniu)
function broadcast(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// --- END OF FILE server.js ---