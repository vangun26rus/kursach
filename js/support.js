let supportUser = null;
let selectedTicketId = null;
let selectedRoomId = null;
let ticketPollTimer = null;
let chatPollTimer = null;

let ticketReplyForm = null;
let ticketReplyTextarea = null;
let ticketSendButton = null;
let ticketDescriptionTextarea = null;
let ticketSubmitButton = null;
let ticketKindSelector = null;
let chatFormElement = null;
let chatTextarea = null;
let chatSendButton = null;

async function initSupportPage() {
  ensureAuthModal();
  supportUser = await getCurrentUser();

  createSupportReplyForm();
  createSupportChatForm();
  initializeTicketComposer();

  document.getElementById("ticketForm").addEventListener("submit", onCreateTicket);
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
  if (ticketKindSelector) {
    ticketKindSelector.querySelectorAll(".kind-option").forEach((button) => {
      button.disabled = !isAuthenticated;
    });
  }
  if (ticketSubmitButton) {
    ticketSubmitButton.disabled = !isAuthenticated;
  }

  if (ticketReplyTextarea) {
    ticketReplyTextarea.disabled = !isAuthenticated;
  }
  if (ticketSendButton) {
    ticketSendButton.disabled = !isAuthenticated;
  }
  if (chatTextarea) {
    chatTextarea.disabled = !isAuthenticated;
  }
  if (chatSendButton) {
    chatSendButton.disabled = !isAuthenticated;
  }
}

function renderGuestPlaceholders() {
  document.getElementById("ticketsList").innerHTML = "<li>Войдите, чтобы видеть ваши обращения.</li>";
  document.getElementById("roomsList").innerHTML = "<li>Войдите, чтобы работать с чатами поддержки.</li>";
}

function createSupportReplyForm() {
  ticketReplyForm = document.createElement("form");
  ticketReplyForm.className = "reply-form hidden";
  ticketReplyForm.innerHTML = `
    <div class="reply-panel">
      <textarea class="reply-textarea" rows="1" placeholder="Ответ администратора на обращение"></textarea>
      <button type="submit" class="send-round-btn" aria-label="Отправить ответ">
        <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 5l8 7-8 7V5z" />
        </svg>
      </button>
    </div>
  `;
  ticketReplyTextarea = ticketReplyForm.querySelector("textarea");
  ticketSendButton = ticketReplyForm.querySelector("button");
  ticketReplyTextarea.addEventListener("input", () => {
    adjustTextareaHeight(ticketReplyTextarea);
    updateSendButtonState(ticketSendButton, ticketReplyTextarea);
  });
  ticketReplyForm.addEventListener("submit", onReplyTicket);
  document.body.appendChild(ticketReplyForm);
}

function createSupportChatForm() {
  chatFormElement = document.createElement("form");
  chatFormElement.className = "reply-form hidden";
  chatFormElement.innerHTML = `
    <div class="reply-panel">
      <textarea class="reply-textarea" rows="1" placeholder="Сообщение в чат быстрой помощи"></textarea>
      <button type="submit" class="send-round-btn" aria-label="Отправить сообщение в чат">
        <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 5l8 7-8 7V5z" />
        </svg>
      </button>
    </div>
  `;
  chatTextarea = chatFormElement.querySelector("textarea");
  chatSendButton = chatFormElement.querySelector("button");
  chatTextarea.addEventListener("input", () => {
    adjustTextareaHeight(chatTextarea);
    updateSendButtonState(chatSendButton, chatTextarea);
  });
  chatFormElement.addEventListener("submit", onSendChat);
  document.body.appendChild(chatFormElement);
}

function initializeTicketComposer() {
  ticketDescriptionTextarea = document.getElementById("ticketDescription");
  ticketSubmitButton = document.querySelector("#ticketForm .send-round-btn");
  ticketKindSelector = document.getElementById("ticketKindSelector");

  if (ticketDescriptionTextarea) {
    adjustTextareaHeight(ticketDescriptionTextarea);
    updateSendButtonState(ticketSubmitButton, ticketDescriptionTextarea);
    ticketDescriptionTextarea.addEventListener("input", () => {
      adjustTextareaHeight(ticketDescriptionTextarea);
      updateSendButtonState(ticketSubmitButton, ticketDescriptionTextarea);
    });
  }

  if (ticketKindSelector) {
    ticketKindSelector.addEventListener("click", (event) => {
      const button = event.target.closest(".kind-option");
      if (!button) return;
      const kind = button.dataset.kind;
      if (!kind) return;
      ticketKindSelector.querySelectorAll(".kind-option").forEach((option) => {
        option.classList.toggle("selected", option === button);
        option.setAttribute("aria-pressed", option === button ? "true" : "false");
      });
      const hiddenSelect = document.getElementById("ticketKind");
      if (hiddenSelect) {
        hiddenSelect.value = kind;
      }
    });
  }
}

function adjustTextareaHeight(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function updateSendButtonState(button, textarea) {
  if (!button || !textarea) return;
  const hasText = textarea.value.trim().length > 0;
  button.classList.toggle("visible", hasText);
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
  document.querySelectorAll('.ticket-item.expanded, .room-item.expanded').forEach((el) => el.classList.remove('expanded'));
  ticketReplyForm?.classList.add('hidden');
  chatFormElement?.classList.add('hidden');
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
    if (ticketDescriptionTextarea) {
      adjustTextareaHeight(ticketDescriptionTextarea);
      updateSendButtonState(ticketSubmitButton, ticketDescriptionTextarea);
    }
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
      container.appendChild(renderTicketItem(ticket));
    }

    container.querySelectorAll("button[data-ticket-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await selectTicket(button.dataset.ticketId);
      });
    });

    if (selectedTicketId) {
      await selectTicket(selectedTicketId);
    }
  } catch (error) {
    container.innerHTML = `<li>Ошибка: ${escapeHtml(error.message)}</li>`;
  }
}

function renderTicketItem(ticket) {
  const li = document.createElement("li");
  li.className = "ticket-item";
  li.dataset.ticketId = ticket.id;
  li.innerHTML = `
    <button type="button" class="ticket-summary" data-ticket-id="${ticket.id}">
      <span class="summary-left">
        ${getStatusIcon(ticket.status)}
        <span class="summary-text">
          <span class="summary-title">#${ticket.id.slice(0, 8)} ${escapeHtml(ticket.subject)}</span>
          <span class="summary-meta">${formatTicketStatus(ticket.status)}</span>
        </span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
    <div class="ticket-details">
      <ul class="ticket-messages"></ul>
      <div class="reply-target"></div>
    </div>
  `;
  return li;
}

function getStatusIcon(status) {
  const normalized = ((status || "").toString().toLowerCase());
  const isClosed = normalized.includes("closed") || normalized.includes("resolved") || normalized.includes("реш") || normalized.includes("закр");
  if (isClosed) {
    return `
      <span class="status-icon solved">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
    `;
  }
  return `
      <span class="status-icon pending">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v5l3 2" />
        </svg>
      </span>
    `;
}

function formatTicketStatus(status) {
  const normalized = ((status || "").toString().toLowerCase());
  return normalized.includes("closed") || normalized.includes("resolved") || normalized.includes("реш") || normalized.includes("закр")
    ? "Закрыт"
    : "Ожидает";
}

async function selectTicket(ticketId) {
  const currentExpanded = document.querySelector('.ticket-item.expanded');
  if (currentExpanded && currentExpanded.dataset.ticketId === ticketId) {
    currentExpanded.classList.remove('expanded');
    selectedTicketId = null;
    ticketReplyForm?.classList.add('hidden');
    return;
  }
  if (currentExpanded) {
    currentExpanded.classList.remove('expanded');
  }

  selectedTicketId = ticketId;
  const targetButton = document.querySelector(`button[data-ticket-id="${ticketId}"]`);
  const targetItem = targetButton ? targetButton.closest('.ticket-item') : null;
  if (!targetItem) {
    return;
  }

  targetItem.classList.add('expanded');
  const replyTarget = targetItem.querySelector('.reply-target');
  if (replyTarget && ticketReplyForm) {
    replyTarget.appendChild(ticketReplyForm);
    ticketReplyForm.classList.remove('hidden');
    updateSendButtonState(ticketSendButton, ticketReplyTextarea);
  }

  await loadTicketMessages(ticketId);
}

async function loadTicketMessages(ticketId) {
  const list = document.querySelector('.ticket-item.expanded .ticket-messages');
  if (!supportUser || !list) {
    return;
  }

  try {
    const messages = await apiRequest(`/api/support/tickets/${ticketId}/messages`);
    if (!messages.length) {
      list.innerHTML = "<li class=\"message-card\">Сообщений пока нет.</li>";
      return;
    }

    list.innerHTML = "";
    for (const message of messages) {
      const li = document.createElement("li");
      li.className = "message-card";
      li.innerHTML = `
        <strong>${escapeHtml(message.senderName)}</strong>
        <p>${escapeHtml(message.message)}</p>
      `;
      list.appendChild(li);
    }
  } catch (error) {
    list.innerHTML = `<li class=\"message-card\">Ошибка: ${escapeHtml(error.message)}</li>`;
  }
}

async function onReplyTicket(event) {
  event.preventDefault();
  if (!(await ensureSupportAuth())) return;

  if (!selectedTicketId) {
    notify("supportStatus", "Сначала выберите обращение.", true);
    return;
  }

  const message = ticketReplyTextarea.value.trim();
  if (!message) return;

  try {
    await apiRequest(`/api/support/tickets/${selectedTicketId}/messages`, {
      method: "POST",
      body: { message }
    });
    ticketReplyTextarea.value = "";
    adjustTextareaHeight(ticketReplyTextarea);
    updateSendButtonState(ticketSendButton, ticketReplyTextarea);
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
      list.appendChild(renderRoomItem(room));
    }

    list.querySelectorAll("button[data-room-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await selectRoom(button.dataset.roomId);
      });
    });

    if (selectedRoomId) {
      await selectRoom(selectedRoomId);
    }
  } catch (error) {
    list.innerHTML = `<li>Ошибка: ${escapeHtml(error.message)}</li>`;
  }
}

function renderRoomItem(room) {
  const li = document.createElement("li");
  li.className = "room-item";
  li.dataset.roomId = room.id;
  li.dataset.roomClosed = room.isClosed ? "true" : "false";
  li.innerHTML = `
    <button type="button" class="room-summary" data-room-id="${room.id}">
      <span class="summary-left">
        ${getStatusIcon(room.isClosed ? "closed" : "open")}
        <span class="summary-text">
          <span class="summary-title">#${room.id.slice(0, 8)} ${escapeHtml(room.subject)}</span>
          <span class="summary-meta">${room.isClosed ? "Закрыт" : "Ожидает"}</span>
        </span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
    <div class="room-details">
      <ul class="chat-messages-list"></ul>
      <div class="reply-target"></div>
    </div>
  `;
  return li;
}

async function selectRoom(roomId) {
  const currentExpanded = document.querySelector('.room-item.expanded');
  if (currentExpanded && currentExpanded.dataset.roomId === roomId) {
    currentExpanded.classList.remove('expanded');
    selectedRoomId = null;
    chatFormElement?.classList.add('hidden');
    return;
  }
  if (currentExpanded) {
    currentExpanded.classList.remove('expanded');
  }

  selectedRoomId = roomId;
  const targetButton = document.querySelector(`button[data-room-id="${roomId}"]`);
  const targetItem = targetButton ? targetButton.closest('.room-item') : null;
  if (!targetItem) {
    return;
  }

  targetItem.classList.add('expanded');
  const replyTarget = targetItem.querySelector('.reply-target');
  if (replyTarget && chatFormElement) {
    replyTarget.appendChild(chatFormElement);
    const isClosed = targetItem.dataset.roomClosed === 'true';
    if (isClosed) {
      chatFormElement.classList.add('hidden');
      chatTextarea.value = "";
      updateSendButtonState(chatSendButton, chatTextarea);
    } else {
      chatFormElement.classList.remove('hidden');
      updateSendButtonState(chatSendButton, chatTextarea);
    }
  }

  await loadChatMessages(roomId);
}

async function loadChatMessages(roomId) {
  const list = document.querySelector('.room-item.expanded .chat-messages-list');
  if (!supportUser || !list) {
    return;
  }

  try {
    const messages = await apiRequest(`/api/support/chat/rooms/${roomId}/messages`);
    if (!messages.length) {
      list.innerHTML = "<li class=\"message-card\">Пока сообщений нет.</li>";
      return;
    }

    list.innerHTML = "";
    for (const message of messages) {
      const li = document.createElement("li");
      li.className = "message-card";
      li.innerHTML = `
        <strong>${escapeHtml(message.senderName)}</strong>
        <p>${escapeHtml(message.message)}</p>
      `;
      list.appendChild(li);
    }
  } catch (error) {
    list.innerHTML = `<li class=\"message-card\">Ошибка: ${escapeHtml(error.message)}</li>`;
  }
}

async function onSendChat(event) {
  event.preventDefault();
  if (!(await ensureSupportAuth())) return;

  if (!selectedRoomId) {
    notify("supportStatus", "Сначала выберите комнату чата.", true);
    return;
  }

  const message = chatTextarea.value.trim();
  if (!message) return;

  try {
    await apiRequest(`/api/support/chat/rooms/${selectedRoomId}/messages`, {
      method: "POST",
      body: { message }
    });
    chatTextarea.value = "";
    adjustTextareaHeight(chatTextarea);
    updateSendButtonState(chatSendButton, chatTextarea);
    await loadChatMessages(selectedRoomId);
  } catch (error) {
    notify("supportStatus", error.message, true);
  }
}

initSupportPage();
