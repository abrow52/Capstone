import "./app.js";
import { db } from "./firebase.js";
import { collection, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const userName = "Annika Hall";
const userID = "yIOHZ2wve9cb6y73u0Oa"; // your real userInfo ID

document.getElementById("welcome").innerText = `Welcome, ${userName}`;


// Navigation
window.goTo = function(page) {
    if (page === "schedule") window.location.href = "index.html";
    if (page === "profile") window.location.href = "profile.html";
    if (page === "dashboard") window.location.href = "dashboard.html";
};

window.logout = function() {
    sessionStorage.clear();
    window.location.href = "login.html";
};

// Load calendar events using your group's function
async function loadCalendarEvents() {
    const snapshot = await getDocs(collection(db, "schedule"));
    const data = [];

    const weekdayOffsets = {
        Monday: 0, Tuesday: 1, Wednesday: 2,
        Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6
    };

    for (const scheduleDoc of snapshot.docs) {
        const scheduleData = scheduleDoc.data();
        const weeklySchedule = scheduleData["schedule "];

        if (!weeklySchedule || !scheduleData.scheduleID) continue;

        const datePart = scheduleData.scheduleID.split("-")[0];
        const weekStart = moment(datePart, "MM/DD/YYYY").startOf("isoWeek");

        for (const day of Object.keys(weekdayOffsets)) {
            const daySchedule = weeklySchedule[day];
            if (!daySchedule) continue;

            for (const shiftKey of Object.keys(daySchedule)) {
                const shift = daySchedule[shiftKey];

                if (!shift.Associate || !shift.ShiftID) continue;
                if (shift.Associate.path !== `userInfo/${userID}`) continue;

                const shiftDoc = await getDoc(shift.ShiftID);
                if (!shiftDoc.exists()) continue;

                const shiftDetails = shiftDoc.data();
                const shiftTime = shiftDetails.ShiftTime;
                if (!shiftTime) continue;

                const shiftDate = weekStart.clone().add(weekdayOffsets[day], "days");

                data.push({
                    eventName: `${formatTime(shiftTime.StartTime)} - ${formatTime(shiftTime.EndTime)}`,
                    calendar: "Work",
                    color: "orange",
                    date: shiftDate
                });
            }
        }
    }

    new Calendar("#calendar", data);
}

function formatTime(hour) {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
}

loadCalendarEvents();