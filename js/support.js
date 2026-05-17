let supportUser = null;
let selectedTicketId = null;
let selectedRoomId = null;
let ticketPollTimer = null;
let chatPollTimer = null;

async function initSupportPage() {
  ensureAuthModal();
  supportUser = await getCurrentUser();

  document.getElementById("ticketForm").addEventListener("submit", onCreateTicket);
  document.getElementById("ticketReplyForm").addEventListener("submit", onReplyTicket);
  document.getElementById("chatForm").addEventListener("submit", onSendChat);
  document.getElementById("supportLoginBtn").addEventListener("click", () => openAuthModal("login"));
  document.getElementById("supportRegisterBtn").addEventListener("click", () => openAuthModal("register"));
  window.addEventListener("auth:changed", onAuthChanged);

  setSupportAccessState(Boolean(supportUser));

  if (supportUser) {
    await startSupportDataFlow();
  } else {
    renderGuestPlaceholders();
  }
}

window.addEventListener("beforeunload", () => {
  stopSupportPolling();
});

function stopSupportPolling() {
  if (ticketPollTimer) {
    clearInterval(ticketPollTimer);
    ticketPollTimer = null;
  }
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

function setSupportAccessState(isAuthenticated) {
  const notice = document.getElementById("supportAuthNotice");
  notice.hidden = isAuthenticated;

  document.getElementById("ticketKind").disabled = !isAuthenticated;
  document.getElementById("ticketSubject").disabled = !isAuthenticated;
  document.getElementById("ticketDescription").disabled = !isAuthenticated;
  document.querySelector('#ticketForm button[type="submit"]').disabled = !isAuthenticated;
  document.getElementById("ticketReplyText").disabled = !isAuthenticated;
  document.querySelector('#ticketReplyForm button[type="submit"]').disabled = !isAuthenticated;
  document.getElementById("chatText").disabled = !isAuthenticated;
  document.querySelector('#chatForm button[type="submit"]').disabled = !isAuthenticated;
}

function renderGuestPlaceholders() {
  document.getElementById("ticketsList").innerHTML = "<li>Войдите, чтобы видеть ваши обращения.</li>";
  document.getElementById("ticketMessages").innerHTML = "<li>Войдите, чтобы открыть переписку по обращению.</li>";
  document.getElementById("roomsList").innerHTML = "<li>Войдите, чтобы работать с чатами поддержки.</li>";
  document.getElementById("chatMessages").innerHTML = "<li>После входа здесь появятся сообщения чата.</li>";
}

async function startSupportDataFlow() {
  stopSupportPolling();
  await loadTickets();
  await loadChatRooms();

  ticketPollTimer = setInterval(loadTickets, 10000);
  chatPollTimer = setInterval(async () => {
    await loadChatRooms();
    if (selectedRoomId) {
      await loadChatMessages(selectedRoomId);
    }
  }, 5000);
}

async function ensureSupportAuth() {
  if (supportUser) {
    return supportUser;
  }

  const user = await requireAuth("login");
  if (!user) {
    notify("supportStatus", "Для этого действия нужен вход в систему.", true);
    return null;
  }

  supportUser = user;
  setSupportAccessState(true);
  await startSupportDataFlow();
  notify("supportStatus", `Добро пожаловать, ${user.displayName}.`);
  return user;
}

async function onAuthChanged(event) {
  supportUser = event.detail && event.detail.user ? event.detail.user : null;
  selectedTicketId = null;
  selectedRoomId = null;

  if (supportUser) {
    setSupportAccessState(true);
    await startSupportDataFlow();
    return;
  }

  stopSupportPolling();
  setSupportAccessState(false);
  renderGuestPlaceholders();
}

async function onCreateTicket(event) {
  event.preventDefault();
  if (!(await ensureSupportAuth())) return;

  const kind = document.getElementById("ticketKind").value;
  const subject = document.getElementById("ticketSubject").value.trim();
  const description = document.getElementById("ticketDescription").value.trim();
  const openChatImmediately = kind === "QuickHelp";

  try {
    await apiRequest("/api/support/tickets", {
      method: "POST",
      body: { subject, description, kind, openChatImmediately }
    });
    notify("supportStatus", "Обращение отправлено.");
    event.target.reset();
    await loadTickets();
    await loadChatRooms();
  } catch (error) {
    notify("supportStatus", error.message, true);
  }
}

async function loadTickets() {
  const container = document.getElementById("ticketsList");
  if (!supportUser) {
    container.innerHTML = "<li>Войдите, чтобы видеть обращения.</li>";
    return;
  }

  const isAdmin = hasRole(supportUser, "Admin");
  const isAuthor = hasRole(supportUser, "Author");
  const path = isAdmin ? "/api/support/tickets" : "/api/support/tickets/my";

  if (isAuthor && !isAdmin) {
    container.innerHTML = "<li>Обращения о технических ошибках доступны только администраторам.</li>";
    document.getElementById("ticketReplyText").disabled = true;
    document.querySelector('#ticketReplyForm button[type="submit"]').disabled = true;
    return;
  }

  try {
    const tickets = await apiRequest(path);
    const technicalTickets = tickets.filter((ticket) => ticket.kind === "TechnicalIssue");
    if (!technicalTickets.length) {
      container.innerHTML = "<li>Обращений пока нет.</li>";
      return;
    }

    container.innerHTML = "";
    for (const ticket of technicalTickets) {
      const li = document.createElement("li");
      li.innerHTML = `
        <button class="link-btn" data-ticket-id="${ticket.id}">
          #${ticket.id.slice(0, 8)} | Техническая ошибка | ${escapeHtml(ticket.subject)} | ${escapeHtml(ticket.status)}
        </button>
      `;
      container.appendChild(li);
    }

    container.querySelectorAll("button[data-ticket-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        selectedTicketId = button.dataset.ticketId;
        await loadTicketMessages(selectedTicketId);
      });
    });
  } catch (error) {
    container.innerHTML = `<li>Ошибка: ${escapeHtml(error.message)}</li>`;
  }
}

async function loadTicketMessages(ticketId) {
  const list = document.getElementById("ticketMessages");
  if (!supportUser) {
    list.innerHTML = "<li>Войдите, чтобы видеть переписку.</li>";
    return;
  }

  try {
    const messages = await apiRequest(`/api/support/tickets/${ticketId}/messages`);
    if (!messages.length) {
      list.innerHTML = "<li>Сообщений пока нет.</li>";
      return;
    }

    list.innerHTML = "";
    for (const message of messages) {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${escapeHtml(message.senderName)}</strong>
        <p>${escapeHtml(message.message)}</p>
      `;
      list.appendChild(li);
    }
  } catch (error) {
    list.innerHTML = `<li>Ошибка: ${escapeHtml(error.message)}</li>`;
  }
}

async function onReplyTicket(event) {
  event.preventDefault();
  if (!(await ensureSupportAuth())) return;

  if (!selectedTicketId) {
    notify("supportStatus", "Сначала выберите обращение.", true);
    return;
  }

  const message = document.getElementById("ticketReplyText").value.trim();
  if (!message) return;

  try {
    await apiRequest(`/api/support/tickets/${selectedTicketId}/messages`, {
      method: "POST",
      body: { message }
    });
    document.getElementById("ticketReplyText").value = "";
    await loadTicketMessages(selectedTicketId);
  } catch (error) {
    notify("supportStatus", error.message, true);
  }
}

async function loadChatRooms() {
  const list = document.getElementById("roomsList");
  if (!supportUser) {
    list.innerHTML = "<li>Войдите, чтобы видеть комнаты чата.</li>";
    return;
  }

  try {
    const rooms = await apiRequest("/api/support/chat/rooms");
    if (!rooms.length) {
      list.innerHTML = "<li>Чатов пока нет.</li>";
      return;
    }

    list.innerHTML = "";
    for (const room of rooms) {
      const li = document.createElement("li");
      li.innerHTML = `
        <button class="link-btn" data-room-id="${room.id}">
          Быстрая помощь #${room.id.slice(0, 8)} | ${escapeHtml(room.subject)}
        </button>
      `;
      list.appendChild(li);
    }

    list.querySelectorAll("button[data-room-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        selectedRoomId = button.dataset.roomId;
        await loadChatMessages(selectedRoomId);
      });
    });
  } catch (error) {
    list.innerHTML = `<li>Ошибка: ${escapeHtml(error.message)}</li>`;
  }
}

async function loadChatMessages(roomId) {
  const list = document.getElementById("chatMessages");
  if (!supportUser) {
    list.innerHTML = "<li>Войдите, чтобы видеть сообщения чата.</li>";
    return;
  }

  try {
    const messages = await apiRequest(`/api/support/chat/rooms/${roomId}/messages`);
    if (!messages.length) {
      list.innerHTML = "<li>Пока сообщений нет.</li>";
      return;
    }

    list.innerHTML = "";
    for (const message of messages) {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${escapeHtml(message.senderName)}</strong>
        <p>${escapeHtml(message.message)}</p>
      `;
      list.appendChild(li);
    }
  } catch (error) {
    list.innerHTML = `<li>Ошибка: ${escapeHtml(error.message)}</li>`;
  }
}

async function onSendChat(event) {
  event.preventDefault();
  if (!(await ensureSupportAuth())) return;

  if (!selectedRoomId) {
    notify("supportStatus", "Сначала выберите комнату чата.", true);
    return;
  }

  const message = document.getElementById("chatText").value.trim();
  if (!message) return;

  try {
    await apiRequest(`/api/support/chat/rooms/${selectedRoomId}/messages`, {
      method: "POST",
      body: { message }
    });
    document.getElementById("chatText").value = "";
    await loadChatMessages(selectedRoomId);
  } catch (error) {
    notify("supportStatus", error.message, true);
  }
}

initSupportPage();
