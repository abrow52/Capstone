
import { db } from "./firebase.js";

import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const currentUserID = sessionStorage.getItem("userID");

let currentUserName = "";
let activeThreadID = null;
let activeMessage = null;

const mailbox = document.getElementById("myForm");

const inboxView = document.getElementById("inboxView");
const readMessageView = document.getElementById("readMessageView");
const composeView = document.getElementById("composeView");

const mailDiv = document.getElementById("mail");
const messageDetails = document.getElementById("messageDetails");

const employeeSelect = document.getElementById("employee-name");

const sendMessageForm = document.getElementById("sendMessageForm");
const replyForm = document.getElementById("replyForm");

//get current users name
async function loadCurrentUser() {
    if (!currentUserID) {
        console.error("No logged-in user found.");
        return;
    }

    try {
        const userRef = doc(db, "userInfo", currentUserID);
        const userSnapshot = await getDoc(userRef);

        if (userSnapshot.exists()) {
            const user = userSnapshot.data();
            currentUserName = user.Name || "Employee";
        }

    } catch (error) {
        console.error("Could not load current user:", error);
    }
}

//open and close mailbox
document.getElementById("openMailbox").addEventListener("click", async () => {
    mailbox.style.display = "flex";

    showInbox();
    await loadInbox();
    await loadEmployees();
});

document.getElementById("closeMailbox").addEventListener("click", () => {
    mailbox.style.display = "none";
});


function showInbox() {
    inboxView.style.display = "block";
    readMessageView.style.display = "none";
    composeView.style.display = "none";

    activeThreadID = null;
    activeMessage = null;
}

function showReadMessage() {
    inboxView.style.display = "none";
    readMessageView.style.display = "block";
    composeView.style.display = "none";
}

function showCompose() {
    inboxView.style.display = "none";
    readMessageView.style.display = "none";
    composeView.style.display = "block";
}

document.getElementById("backToInbox").addEventListener("click", async () => {
    showInbox();
    await loadInbox();
});

document.getElementById("showCompose").addEventListener("click", () => {
    showCompose();
});

document.getElementById("backFromCompose").addEventListener("click", () => {
    showInbox();
});

//load messages in the inbox
async function loadInbox() {
    if (!currentUserID) return;

    mailDiv.innerHTML = "Loading messages...";

    try {
        const inboxQuery = query(
            collection(db, "Messages"),
            where("recipientId", "==", currentUserID)
        );

        const snapshot = await getDocs(inboxQuery);

        mailDiv.innerHTML = "";

        if (snapshot.empty) {
            mailDiv.textContent = "You have no messages.";
            return;
        }

        //display newest messages first
        const messages = snapshot.docs.sort((a, b) => {
            const dateA = a.data().createdAt?.toMillis() || 0;
            const dateB = b.data().createdAt?.toMillis() || 0;

            return dateB - dateA;
        });

        messages.forEach((messageDoc) => {
            const message = messageDoc.data();

            const preview = document.createElement("div");
            preview.classList.add("message-preview");

            if (!message.read) {
                preview.classList.add("unread");
            }

            const sender = document.createElement("p");
            sender.textContent = message.senderName || "Unknown sender";

            const subject = document.createElement("p");
            subject.textContent = message.subject || "(No subject)";

            const date = document.createElement("small");
            date.textContent = formatDate(message.createdAt);

            preview.appendChild(sender);
            preview.appendChild(subject);
            preview.appendChild(date);

            preview.addEventListener("click", () => {
                openMessage(messageDoc.id, message);
            });

            mailDiv.appendChild(preview);
        });

    } catch (error) {
        console.error("Error loading inbox:", error);
        mailDiv.textContent = "Could not load your messages.";
    }
}

//display message and any replies
async function openMessage(messageID, message) {
    activeThreadID = message.threadId || messageID;
    activeMessage = message;

    showReadMessage();

    messageDetails.textContent = "Loading conversation...";

    try {
        const threadQuery = query(
            collection(db, "Messages"),
            where("threadId", "==", activeThreadID),
            where("participantIds", "array-contains", currentUserID)
        );

        const snapshot = await getDocs(threadQuery);

        const messages = snapshot.docs.sort((a, b) => {
            const dateA = a.data().createdAt?.toMillis() || 0;
            const dateB = b.data().createdAt?.toMillis() || 0;

            return dateA - dateB;
        });

        messageDetails.innerHTML = "";

        messages.forEach((messageDoc) => {
            const data = messageDoc.data();

            const messageBox = document.createElement("div");

            const sender = document.createElement("strong");
            sender.textContent = data.senderName || "Unknown sender";

            const date = document.createElement("small");
            date.textContent = formatDate(data.createdAt);

            const subject = document.createElement("h5");
            subject.textContent = data.subject || "(No subject)";

            const body = document.createElement("p");
            body.textContent = data.body || "";

            messageBox.appendChild(sender);
            messageBox.appendChild(document.createElement("br"));
            messageBox.appendChild(date);
            messageBox.appendChild(subject);
            messageBox.appendChild(body);

            messageDetails.appendChild(messageBox);
            messageDetails.appendChild(document.createElement("hr"));

            if (
                data.recipientId === currentUserID &&
                data.read === false
            ) {
                updateDoc(messageDoc.ref, { read: true })
                    .catch(error => console.error("Read status error:", error));
            }
        });

        //send the reply to the right person
        const latestMessage = messages[messages.length - 1]?.data();

        if (latestMessage) {
            const otherParticipantID = latestMessage.participantIds
                ?.find(id => id !== currentUserID);

            activeMessage = {
                ...latestMessage,
                senderId: otherParticipantID
            };
        }

    } catch (error) {
        console.error("Error opening message:", error);
        messageDetails.textContent = "Could not load this conversation.";
    }
}

//load employee list
async function loadEmployees() {
    if (!currentUserID) return;

    try {
        const employeeSnapshot = await getDocs(
            collection(db, "userInfo")
        );

        employeeSelect.innerHTML =
            '<option value="">Select an employee</option>';

        employeeSnapshot.forEach((employeeDoc) => {
            if (employeeDoc.id === currentUserID) return;

            const employee = employeeDoc.data();
            const employeeName = employee.Name;

            const option = document.createElement("option");
            option.value = employeeDoc.id;
            option.textContent = employee.Name;

            employeeSelect.appendChild(option);
        });

    } catch (error) {
        console.error("Could not load employees:", error);
    }
}

//send a message
sendMessageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const recipientID = employeeSelect.value;
    const subject = document.getElementById("messageSubject").value.trim();
    const body = document.getElementById("messageBody").value.trim();

    if (!recipientID || !subject || !body) {
        alert("Please complete all fields.");
        return;
    }

    try {
        const messageRef = doc(collection(db, "Messages"));

        await setDoc(messageRef, {
            senderId: currentUserID,
            recipientId: recipientID,
            participantIds: [currentUserID, recipientID],
            senderName: currentUserName,
            subject: subject,
            body: body,
            createdAt: serverTimestamp(),
            read: false,
            threadId: messageRef.id
        });

        alert("Message sent!");

        sendMessageForm.reset();
        showInbox();
        await loadInbox();

    } catch (error) {
        console.error("Error sending message:", error);
        alert("Could not send message: " + error.message);
    }
});

//reply to a message
replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!activeThreadID || !activeMessage) return;

    const body = document.getElementById("replyBody").value.trim();

    if (!body) return;

    const recipientID = activeMessage.senderId;

    if (recipientID === currentUserID) {
        alert("There is no other recipient to reply to.");
        return;
    }

    try {
        const replyRef = doc(collection(db, "Messages"));

        await setDoc(replyRef, {
            senderId: currentUserID,
            recipientId: recipientID,
            participantIds: [currentUserID, recipientID],
            senderName: currentUserName,
            subject: activeMessage.subject || "Re: Message",
            body: body,
            createdAt: serverTimestamp(),
            read: false,
            threadId: activeThreadID
        });

        document.getElementById("replyBody").value = "";

        await openMessage(replyRef.id, {
            threadId: activeThreadID
        });

    } catch (error) {
        console.error("Error sending reply:", error);
        alert("Could not send reply: " + error.message);
    }
});

//need to change
function formatDate(timestamp) {
    if (!timestamp) return "";

    return timestamp.toDate().toLocaleString();
}

await loadCurrentUser();
