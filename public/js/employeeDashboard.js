import { db } from "./firebase.js";

import {
    collection, getDocs, getDoc, query, where, 
    addDoc, updateDoc, deleteDoc, doc, Timestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

const currentUserID = sessionStorage.getItem("userID");
const currentTitle = sessionStorage.getItem("Title");
const isManager = currentTitle === "Manager";

if (!currentUserID) {
    throw new Error("No logged-in user was found.");
}

const userCollection = collection(db, "userInfo");
const contactCollection = collection(db, "EmployeeContact");
const availabilityCollection = collection(db, "availability");

function getLinkedUserID(value) {
    if (typeof value === "string") {
        return value;
    }

    // Handle Firestore DocumentReference fields
    if (value && typeof value.path === "string") {
        return value.path.startsWith("userInfo/")
            ? value.path.substring("userInfo/".length)
            : null;
    }

    return null;
}

let currentUserDocID;
let currentUserInfo;
let currentContactInfo;
let currentContactDocID;
let availabilityRecords = [];

// --------------------------------------------------
// LOAD DASHBOARD
// --------------------------------------------------

async function loadDashboard() {
    try {
        // Session userID is the actual Firestore document ID
        currentUserDocID = currentUserID;

        // Retrieve the user's document directly
        const userDoc = await getDoc(
            doc(db, "userInfo", currentUserDocID)
        );

        if (!userDoc.exists()) {
            throw new Error("User information could not be found.");
        }

        currentUserInfo = userDoc.data();

        // Find contact information using the userInfo document ID
        const userRef = doc(db, "userInfo", currentUserDocID);

        // Get contact information (try both string and reference IDs)
        // Retrieve all contact records and match by linked user document ID
        const contactSnapshot = await getDocs(contactCollection);

        const matchingContacts = contactSnapshot.docs.filter(contactDoc => {
            const contact = contactDoc.data();
            return getLinkedUserID(contact.id) === currentUserDocID;
        });

        currentContactDocID = null;
        currentContactInfo = {};

        if (matchingContacts.length > 0) {
            const contactDoc = matchingContacts[0];

            currentContactDocID = contactDoc.id;
            currentContactInfo = contactDoc.data();
        }

        console.log("Logged-in user document ID:", currentUserDocID);
        console.log("Matching contact records:", matchingContacts.length);
        console.log("Current contact information:", currentContactInfo);

        // Get availability (try both string and reference IDs)
        const [availabilityStringSnapshot, availabilityRefSnapshot] =
            await Promise.all([
                getDocs(query(
                    availabilityCollection,
                    where("id", "==", currentUserDocID)
                )),
                getDocs(query(
                    availabilityCollection,
                    where("id", "==", userRef)
                ))
            ]);

        const availabilityDocs = new Map();

        [
            ...availabilityStringSnapshot.docs,
            ...availabilityRefSnapshot.docs
        ].forEach(item => availabilityDocs.set(item.id, item));

        availabilityRecords = [...availabilityDocs.values()].map(item => ({
            docID: item.id,
            ...item.data()
        }));

        console.log("Contact information:", currentContactInfo);
        console.log("Availability records:", availabilityRecords);
        displayMyInformation();
        displayAvailability();

        if (isManager) {
            document.getElementById(
                "employeeDirectorySection"
            ).style.display = "block";

            await loadEmployeeDirectory();
        }

        createAvailabilityInputs();

    } catch (error) {
        console.error("Dashboard loading error:", error);
        alert("There was a problem loading your dashboard.");
    }
}

// --------------------------------------------------
// DISPLAY PERSONAL INFORMATION
// --------------------------------------------------

// --------------------------------------------------
// DISPLAY AND EDIT PERSONAL INFORMATION
// --------------------------------------------------

const editMyInfoBtn = document.getElementById("editMyInfo");
const myInformationContainer = document.getElementById("myInformation");

// Display normal employee information
function displayMyInformation() {
    myInformationContainer.innerHTML = "";

    const fields = [
        ["Name", currentUserInfo.Name],
        ["Title", currentUserInfo.Title],
        ["Email", currentContactInfo.Email],
        ["Phone", currentContactInfo.PhoneNumber],
        ["Address", currentContactInfo.Address]
    ];

    fields.forEach(([label, value]) => {
        const paragraph = document.createElement("p");
        const strong = document.createElement("strong");

        strong.textContent = `${label}: `;
        paragraph.append(
            strong,
            document.createTextNode(value || "Not provided")
        );

        myInformationContainer.appendChild(paragraph);
    });
}

// Turn displayed information into editable fields
function editMyInformation() {
    myInformationContainer.innerHTML = "";

    const fields = [
        {
            label: "Name",
            id: "editName",
            value: currentUserInfo.Name,
            required: true
        },
        {
            label: "Address",
            id: "editAddress",
            value: currentContactInfo.Address
        },
        {
            label: "Email",
            id: "editEmail",
            value: currentContactInfo.Email,
            type: "email"
        },
        {
            label: "Phone Number",
            id: "editPhone",
            value: currentContactInfo.PhoneNumber,
            type: "tel"
        }
    ];

    const editForm = document.createElement("form");
    editForm.id = "inlineEditForm";

    fields.forEach(field => {
        const wrapper = document.createElement("div");
        wrapper.className = "mb-3";

        const label = document.createElement("label");
        label.htmlFor = field.id;
        label.className = "form-label";
        label.textContent = field.label;

        const input = document.createElement("input");
        input.type = field.type || "text";
        input.id = field.id;
        input.className = "form-control";
        input.value = field.value || "";
        input.required = Boolean(field.required);

        wrapper.append(label, input);
        editForm.appendChild(wrapper);
    });

    // Save button
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "btn btn-success me-2";
    saveButton.textContent = "Save Changes";

    // Cancel button
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "btn btn-secondary";
    cancelButton.textContent = "Cancel";

    editForm.append(saveButton, cancelButton);

    myInformationContainer.appendChild(editForm);

    // Cancel editing
    cancelButton.addEventListener("click", () => {
        displayMyInformation();
        editMyInfoBtn.style.display = "inline-block";
    });

    // Save changes
    editForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
            const newName =
                document.getElementById("editName").value.trim();

            const newContact = {
                Address: document.getElementById("editAddress").value.trim(),
                Email: document.getElementById("editEmail").value.trim(),
                PhoneNumber: document.getElementById("editPhone").value.trim(),
                id: currentUserDocID
            };

            if (!newName) {
                alert("Please enter your name.");
                return;
            }

            // Update name in userInfo
            await updateDoc(
                doc(db, "userInfo", currentUserDocID),
                { Name: newName }
            );

            // Update or create contact information
            if (currentContactDocID) {
                await updateDoc(
                    doc(db, "EmployeeContact", currentContactDocID),
                    newContact
                );
            } else {
                const newContactDoc = await addDoc(
                    contactCollection,
                    newContact
                );

                currentContactDocID = newContactDoc.id;
            }

            // Update local information
            currentUserInfo.Name = newName;
            currentContactInfo = newContact;

            sessionStorage.setItem("Name", newName);

            // Return to normal display
            displayMyInformation();
            editMyInfoBtn.style.display = "inline-block";

            alert("Your information was updated!");

        } catch (error) {
            console.error("Error updating information:", error);
            alert("Could not update your information: " + error.message);
        }
    });
}

// Open editing mode
editMyInfoBtn.addEventListener("click", () => {
    editMyInfoBtn.style.display = "none";
    editMyInformation();
});


const editMyPassBtn = document.getElementById("editMyPass");

//change password
const changePasswordForm = document.getElementById("changePasswordForm");

if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
            const currentPassword = document.getElementById("currentPassword").value;
            const newPassword = document.getElementById("newPassword").value;
            const confirmPassword = document.getElementById("confirmPassword").value;

            // Check that the current user ID exists
            if (!currentUserID) {
                alert("Could not identify the logged-in user. Please log in again.");
                return;
            }

            // Check current password
            if (currentPassword !== currentUserInfo.Password) {
                alert("Your current password is incorrect.");
                return;
            }

            // Check new passwords match
            if (newPassword !== confirmPassword) {
                alert("Your new passwords do not match.");
                return;
            }

            if (!newPassword.trim()) {
                alert("Please enter a new password.");
                return;
            }

            // Update the correct userInfo document
            await updateDoc(
                doc(db, "userInfo", currentUserID),
                {
                    Password: newPassword
                }
            );

            // Update local user information
            currentUserInfo.Password = newPassword;

            changePasswordForm.reset();

            alert("Your password has been successfully updated!");

        } catch (error) {
            console.error("Password update error:", error);
            alert("Unable to update password: " + error.message);
        }
    });
}


editMyPassBtn.addEventListener("click", () => {
    // changePassDiv.style.display = "block";
    changePassDiv.classList.toggle('hidden');
    // editMyInformation();
});

// --------------------------------------------------
// MANAGER EMPLOYEE DIRECTORY
// --------------------------------------------------

async function loadEmployeeDirectory() {
    const container = document.getElementById("employeeDirectory");

    const [usersSnapshot, contactsSnapshot] = await Promise.all([
        getDocs(userCollection),
        getDocs(contactCollection)
    ]);

    console.log("Total user documents:", usersSnapshot.size);
    console.log("Total contact documents:", contactsSnapshot.size);

    // Match contact information to userInfo document IDs
    const contactsByUserID = new Map();

    contactsSnapshot.docs.forEach(contactDoc => {
        const contact = contactDoc.data();
        const linkedUserID = getLinkedUserID(contact.id);

        if (linkedUserID) {
            if (!contactsByUserID.has(linkedUserID)) {
                contactsByUserID.set(linkedUserID, contact);
            }
        }
    });

    container.innerHTML = "";

    let displayedEmployees = 0;

    usersSnapshot.docs.forEach(userDoc => {
        const employee = userDoc.data();

        // Exclude only the currently logged-in manager
        if (userDoc.id === currentUserDocID) {
            return;
        }

        const contact = contactsByUserID.get(userDoc.id) || {};

        const card = document.createElement("div");
        card.className = "employeeInfo";

        const heading = document.createElement("h5");
        heading.textContent = employee.Name || "Unnamed Employee";

        const details = document.createElement("div");

        const fields = [
            ["Title", employee.Title],
            ["Email", contact.Email],
            ["Phone", contact.PhoneNumber],
            ["Address", contact.Address]
        ];

        fields.forEach(([label, value]) => {
            const paragraph = document.createElement("p");
            const strong = document.createElement("strong");

            strong.textContent = `${label}: `;

            paragraph.append(
                strong,
                document.createTextNode(value || "Not provided")
            );

            details.appendChild(paragraph);
        });

        card.append(heading, details);
        container.appendChild(card);

        displayedEmployees++;
    });

    console.log("Employees displayed:", displayedEmployees);

    if (displayedEmployees === 0) {
        container.textContent = "No other employees were found.";
    }
}

// --------------------------------------------------
// AVAILABILITY INPUTS
// --------------------------------------------------

const weekdays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
];

function createAvailabilityInputs() {
    const container = document.getElementById("availabilityDays");

    container.innerHTML = "";

    weekdays.forEach(day => {
        const row = document.createElement("div");
        row.className = "availabilityDay";

        row.innerHTML = `
            <label>
                <input type="checkbox" id="${day}Available">
                ${day}
            </label>

            <div>
                <label for="${day}Start">Start</label>
                <input type="time" id="${day}Start" disabled>
            </div>

            <div>
                <label for="${day}End">End</label>
                <input type="time" id="${day}End" disabled>
            </div>
        `;

        container.appendChild(row);

        const checkbox = row.querySelector(`#${day}Available`);
        const startInput = row.querySelector(`#${day}Start`);
        const endInput = row.querySelector(`#${day}End`);

        checkbox.addEventListener("change", () => {
            startInput.disabled = !checkbox.checked;
            endInput.disabled = !checkbox.checked;

            if (!checkbox.checked) {
                startInput.value = "";
                endInput.value = "";
            }
        });
    });

    // Set the minimum date to 14 days from today
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 14);

    document.getElementById("availabilityStartDate").min =
        formatDateForInput(minDate);
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// --------------------------------------------------
// DISPLAY AVAILABILITY
// --------------------------------------------------

function displayAvailability() {
    const currentContainer =
        document.getElementById("currentAvailability");

    const futureContainer =
        document.getElementById("futureAvailability");

    const now = new Date();

    // Find the latest currently effective availability
    const currentRecords = availabilityRecords
        .filter(record =>
            record.StartDate &&
            record.StartDate.toDate() <= now
        )
        .sort((a, b) =>
            b.StartDate.toMillis() - a.StartDate.toMillis()
        );

    const currentRecord = currentRecords[0];

    // Find future availability changes
    const futureRecords = availabilityRecords
        .filter(record =>
            record.StartDate &&
            record.StartDate.toDate() > now
        )
        .sort((a, b) =>
            a.StartDate.toMillis() - b.StartDate.toMillis()
        );

    // Display current availability
    currentContainer.innerHTML = "";

    if (currentRecord) {
        const effectiveDate = document.createElement("p");
        effectiveDate.textContent =
            `Effective: ${currentRecord.StartDate.toDate().toLocaleDateString()}`;

        currentContainer.appendChild(effectiveDate);

        displayDayTimes(currentContainer, currentRecord.DayTimeAvail);
    } else {
        currentContainer.textContent =
            "You have not submitted availability yet.";
    }

    // Display future availability on the right
    futureContainer.innerHTML = "";

    if (futureRecords.length === 0) {
        futureContainer.textContent =
            "No scheduled availability changes.";
    }

    futureRecords.forEach(record => {
        const card = document.createElement("div");
        card.className = "futureAvailabilityCard";

        const date = document.createElement("p");
        date.textContent =
            `Effective: ${record.StartDate.toDate().toLocaleDateString()}`;

        card.appendChild(date);

        displayDayTimes(card, record.DayTimeAvail);

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.textContent = "Cancel Change";
        cancelButton.className = "btn btn-danger btn-sm";

        cancelButton.addEventListener("click", () => {
            cancelFutureAvailability(record);
        });

        card.appendChild(cancelButton);

        futureContainer.appendChild(card);
    });
}

function displayDayTimes(container, dayTimeAvail = {}) {
    weekdays.forEach(day => {
        const paragraph = document.createElement("p");
        const times = dayTimeAvail?.[day];

        paragraph.textContent = times
            ? `${day}: ${times.StartTime} – ${times.EndTime}`
            : `${day}: Unavailable`;

        container.appendChild(paragraph);
    });
}

// --------------------------------------------------
// EDIT AVAILABILITY
// --------------------------------------------------

const editAvailabilityBtn = document.getElementById("editAvailability");
const availabilityForm = document.getElementById("availabilityForm");

editAvailabilityBtn.addEventListener("click", () => {
    // Pre-fill from the latest currently effective schedule
    const now = new Date();

    const currentRecord = availabilityRecords
        .filter(record =>
            record.StartDate &&
            record.StartDate.toDate() <= now
        )
        .sort((a, b) =>
            b.StartDate.toMillis() - a.StartDate.toMillis()
        )[0];

    const existingDays = currentRecord?.DayTimeAvail || {};

    weekdays.forEach(day => {
        const times = existingDays[day];

        const checkbox = document.getElementById(`${day}Available`);
        const start = document.getElementById(`${day}Start`);
        const end = document.getElementById(`${day}End`);

        checkbox.checked = Boolean(times);
        start.disabled = !times;
        end.disabled = !times;

        start.value = times?.StartTime || "";
        end.value = times?.EndTime || "";
    });

    // Recalculate minimum date each time the form opens
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 14);

    document.getElementById("availabilityStartDate").min =
        formatDateForInput(minDate);

    availabilityForm.style.display = "block";
    editAvailabilityBtn.style.display = "none";
});

document.getElementById("cancelAvailabilityEdit")
    .addEventListener("click", () => {
        availabilityForm.style.display = "none";
        editAvailabilityBtn.style.display = "block";
    });

// --------------------------------------------------
// SAVE NEW AVAILABILITY
// --------------------------------------------------

availabilityForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
        const selectedDate =
            document.getElementById("availabilityStartDate").value;

        if (!selectedDate) {
            alert("Please select an effective date.");
            return;
        }

        // Use local calendar dates for the 14-day rule
        const [year, month, day] = selectedDate.split("-").map(Number);

        const effectiveDate = new Date(year, month - 1, day);
        effectiveDate.setHours(0, 0, 0, 0);

        const minimumDate = new Date();
        minimumDate.setHours(0, 0, 0, 0);
        minimumDate.setDate(minimumDate.getDate() + 14);

        if (effectiveDate < minimumDate) {
            alert("Your availability must start at least 14 days from today.");
            return;
        }

        const dayTimeAvail = {};

        for (const weekday of weekdays) {
            const available =
                document.getElementById(`${weekday}Available`).checked;

            if (!available) continue;

            const startTime =
                document.getElementById(`${weekday}Start`).value;

            const endTime =
                document.getElementById(`${weekday}End`).value;

            if (!startTime || !endTime) {
                alert(`Please enter both times for ${weekday}.`);
                return;
            }

            if (startTime >= endTime) {
                alert(`The end time for ${weekday} must be after the start time.`);
                return;
            }

            dayTimeAvail[weekday] = {
                StartTime: startTime,
                EndTime: endTime
            };
        }

        if (Object.keys(dayTimeAvail).length === 0) {
            alert("Please select at least one available day.");
            return;
        }

        const newAvailability = {
            id: doc(db, "userInfo", currentUserDocID),
            StartDate: Timestamp.fromDate(effectiveDate),
            DayTimeAvail: dayTimeAvail
        };

        // Create a new document. Do not overwrite previous availability.
        await addDoc(availabilityCollection, newAvailability);

        // Refresh availability records
        const updatedSnapshot = await getDocs(
            query(
                availabilityCollection,
                where("id", "==", doc(db, "userInfo", currentUserDocID))
            )
        );
        
        availabilityRecords = updatedSnapshot.docs.map(item => ({
            docID: item.id,
            ...item.data()
        }));

        displayAvailability();

        availabilityForm.style.display = "none";
        editAvailabilityBtn.style.display = "block";

        alert("Your new availability has been saved!");

    } catch (error) {
        console.error("Availability update error:", error);
        alert("There was a problem saving your availability.");
    }
});

async function cancelFutureAvailability(record) {
    const startDate = record.StartDate.toDate();

    // Prevent cancelling current or past availability
    if (startDate <= new Date()) {
        alert("Only future availability changes can be cancelled.");
        return;
    }

    const confirmed = confirm(
        "Are you sure you want to cancel this future availability change?"
    );

    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, "availability", record.docID));

        // Remove the deleted record from the locally loaded records
        const index = availabilityRecords.findIndex(
            item => item.docID === record.docID
        );

        if (index !== -1) {
            availabilityRecords.splice(index, 1);
        }

        displayAvailability();

        alert("Future availability change cancelled!");
    } catch (error) {
        console.error("Error cancelling availability:", error);
        alert("Unable to cancel this availability change.");
    }
}

loadDashboard();
