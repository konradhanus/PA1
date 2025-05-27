document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');
    let map;
    let myMarker;
    const userMarkers = new Map(); // Przechowuje markery innych użytkowników { uuid: marker }

    const userName = prompt("Podaj swoją nazwę użytkownika:", "AnonimowyWilk") || `Użytkownik${Math.floor(Math.random() * 1000)}`;
    const myUUID = generateUUID();

    // Elementy UI dla listy użytkowników i manualnej lokalizacji
    const userListElement = document.getElementById('userList');
    const manualLatInput = document.getElementById('manualLat');
    const manualLngInput = document.getElementById('manualLng');
    const updateLocationBtn = document.getElementById('updateLocationBtn');

    const connectedUsers = new Map(); // { uuid: { userName, lat, lng, uuid } }

    // Inicjalizacja WebSocket
    const socket = new WebSocket('wss://psiaapka.pl/PA1/'); // Zmień na adres swojego serwera jeśli jest inny

    socket.onopen = () => {
        console.log('Połączono z serwerem WebSocket.');
        // Rozpocznij śledzenie lokalizacji po połączeniu
        startGeolocationTracking();
        renderUserList();
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            // console.log('Odebrano dane z serwera:', data);

            if (data.type === 'user_update') {
                // Aktualizacje od innych użytkowników
                if (data.user.uuid !== myUUID) {
                    connectedUsers.set(data.user.uuid, data.user);
                }
                updateUserOnMap(data.user);
            } else if (data.type === 'all_users') {
                data.users.forEach(user => {
                    if (user.uuid !== myUUID) {
                        connectedUsers.set(user.uuid, user);
                        updateUserOnMap(user);
                    }
                });
            } else if (data.type === 'user_disconnected') {
                connectedUsers.delete(data.uuid);
                removeUserFromMap(data.uuid);
            }
            renderUserList();
        } catch (error)
        {
            console.error('Błąd przetwarzania wiadomości od serwera:', error);
        }
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
        alert('Nie można połączyć się z serwerem WebSocket. Sprawdź konsolę.');
    };

    socket.onclose = () => {
        console.log('Rozłączono z serwerem WebSocket.');
        alert('Połączenie z serwerem zostało zerwane.');
        connectedUsers.clear();
        renderUserList();
    };

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function initializeMap(lat, lng) {
        if (!map) {
            map = L.map(mapElement).setView([lat, lng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
        }
    }

    function sendLocation(latitude, longitude) {
        if (socket.readyState === WebSocket.OPEN) {
            const positionData = {
                uuid: myUUID,
                userName: userName,
                lat: latitude,
                lng: longitude
            };
            socket.send(JSON.stringify(positionData));

            connectedUsers.set(myUUID, {
                uuid: myUUID,
                userName: userName,
                lat: latitude,
                lng: longitude
            });
            renderUserList();

            if (map) {
                 if (!myMarker) {
                    myMarker = L.marker([latitude, longitude], {
                        icon: L.icon({
                            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x-red.png',
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34],
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                            shadowSize: [41, 41]
                        })
                    }).addTo(map).bindPopup(`Ty (${userName})`);
                    map.setView([latitude, longitude], map.getZoom() || 15);
                } else {
                    myMarker.setLatLng([latitude, longitude]);
                }
            }
        }
    }

    function updateUserOnMap(userData) {
        if (!map) {
            initializeMap(userData.lat, userData.lng);
        }
        
        if (userData.uuid === myUUID) {
            return;
        }

        if (userMarkers.has(userData.uuid)) {
            userMarkers.get(userData.uuid).setLatLng([userData.lat, userData.lng])
                .getPopup().setContent(userData.userName);
        } else {
            const marker = L.marker([userData.lat, userData.lng]).addTo(map)
                .bindPopup(userData.userName);
            userMarkers.set(userData.uuid, marker);
        }
    }

    function removeUserFromMap(uuid) {
        if (userMarkers.has(uuid)) {
            map.removeLayer(userMarkers.get(uuid));
            userMarkers.delete(uuid);
        }
    }

    function startGeolocationTracking() {
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    if (!map) {
                        initializeMap(latitude, longitude);
                    }
                    sendLocation(latitude, longitude);
                },
                (error) => {
                    console.error("Błąd geolokalizacji: ", error);
                    alert(`Błąd geolokalizacji: ${error.message}. Upewnij się, że zezwoliłeś na dostęp do lokalizacji.`);
                    if (!map) {
                        const fallbackLat = 52.2297;
                        const fallbackLng = 21.0122;
                        initializeMap(fallbackLat, fallbackLng);
                        sendLocation(fallbackLat, fallbackLng);
                    }
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        } else {
            alert("Twoja przeglądarka nie wspiera geolokalizacji.");
            const fallbackLat = 52.2297;
            const fallbackLng = 21.0122;
            initializeMap(fallbackLat, fallbackLng);
            sendLocation(fallbackLat, fallbackLng);
        }
    }

    function renderUserList() {
        if (!userListElement) return;
        userListElement.innerHTML = '';

        if (connectedUsers.size === 0) {
            const li = document.createElement('li');
            li.textContent = 'Brak aktywnych użytkowników.';
            userListElement.appendChild(li);
            return;
        }

        const usersArray = Array.from(connectedUsers.values());
        usersArray.sort((a, b) => {
            if (a.uuid === myUUID) return -1;
            if (b.uuid === myUUID) return 1;
            return a.userName.localeCompare(b.userName);
        });

        usersArray.forEach(user => {
            const li = document.createElement('li');
            
            let displayName = user.userName;
            if (user.uuid === myUUID) {
                displayName += ' (Ty)';
                li.classList.add('is-self');
            }
            
            // Użyj innerHTML, aby łatwiej formatować tekst z <br>
            // Można też użyć kilku spanów dla lepszej kontroli stylistycznej
            li.innerHTML = `
                <strong>${displayName}</strong><br>
                <small>Lat: ${user.lat.toFixed(4)}, Lng: ${user.lng.toFixed(4)}</small><br>
                <small style="word-break: break-all;">UUID: ${user.uuid}</small>
            `;
            userListElement.appendChild(li);
        });
    }

    updateLocationBtn.addEventListener('click', () => {
        const latStr = manualLatInput.value;
        const lngStr = manualLngInput.value;

        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        if (isNaN(lat) || isNaN(lng)) {
            alert('Proszę podać poprawne wartości liczbowe dla szerokości i długości geograficznej.');
            return;
        }

        if (!map) {
            initializeMap(lat, lng);
        }
        sendLocation(lat, lng);
    });

    renderUserList();
});