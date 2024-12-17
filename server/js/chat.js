let counter = 0;
let currentRoom = '';

const socket = io({
  ackTimeout: 10000,
  auth: {
    serverOffset: 0
  }
});

const roomInput = document.getElementById('room');
const joinButton = document.getElementById('join');
const leaveButton = document.getElementById('leave');
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usernameDisplay = document.getElementById('username-display');

form.querySelector('button').disabled = true;
input.disabled = true;
joinButton.addEventListener('click', () => {
  const room = roomInput.value.trim();
  if (room) {
    currentRoom = room;
    socket.emit('join room', room);
    messages.value = ''; // Clear messages
    input.disabled = false;
    form.querySelector('button').disabled = false;
    leaveButton.disabled = false;
    joinButton.disabled = true; // Prevent rejoining the same room
    form.style.display = 'flex'; // Show the form
  }
});

leaveButton.addEventListener('click', () => {
  if (room) {
    socket.emit('leave room', currentRoom);
    currentRoom = '';
    messages.innerHTML = ''; // Clear the messages from the UI
    form.querySelector('button').disabled = true;
    input.disabled = true;
    leaveButton.disabled = true;
    joinButton.disabled = false; // Allow joining a new room
    roomInput.value = ''; // Clear the room input
    form.style.display = 'none'; // Hide the form
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value && currentRoom) {  // Ensure a room is joined
    const clientOffset = `${socket.id}-${counter++}`;
    socket.emit('chat message', input.value, clientOffset);
    input.value = ''; // Clear the input after sending
  } else {
    alert("You must join a room before sending a message.");
  }
});
      
// Listen for the username and update the frontend UI
socket.on('username', (username) => {
  document.getElementById('username').textContent = username; // Display the username in the UI
});

socket.on('chat message', (msg, serverOffset) => {
  const item = document.createElement('li');
  const [username, messageContent] = msg.split(': ', 2); // Split username and message content
  const usernameElement = document.createElement('strong');
  usernameElement.textContent = username; // Style username separately
  const messageElement = document.createElement('span');
  messageElement.textContent = `: ${messageContent}`;

  item.appendChild(usernameElement);
  item.appendChild(messageElement);
  messages.appendChild(item);

  window.scrollTo(0, document.body.scrollHeight);
  socket.auth.serverOffset = serverOffset;
});

