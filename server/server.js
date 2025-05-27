const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// Przechowujemy klientów jako Map, gdzie kluczem jest obiekt WebSocket,
// a wartością są dane użytkownika (uuid, userName, lat, lng)
const clients = new Map();

console.log('Serwer WebSocket nasłuchuje na porcie 8080...');

wss.on('connection', (ws) => {
    console.log('Nowy klient połączony.');

    // Kiedy klient wysyła wiadomość
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // console.log('Odebrano dane:', data);

            // Wymagane pola
            if (!data.uuid || !data.userName || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
                console.warn('Odebrano niekompletne dane:', data);
                return;
            }

            const clientData = {
                uuid: data.uuid,
                userName: data.userName,
                lat: data.lat,
                lng: data.lng
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
            clients.delete(ws);
            broadcast({ type: 'user_disconnected', uuid: disconnectedUserOnError.uuid });
        }
    });
});

// Funkcja do rozgłaszania informacji o użytkowniku (jego aktualizacji)
function broadcastUserInfo(userData, sender) {
    const message = JSON.stringify({ type: 'user_update', user: userData });
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