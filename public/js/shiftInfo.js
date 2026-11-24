//labor information 
import { db } from "./firebase.js";
import {collection, getDocs, getDoc} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const infoButton = document.getElementById("shiftInfoBtn");
const closeButton = document.getElementById("closeShiftInfo");
const infoPanel = document.getElementById("shiftInfoPanel");
const infoContent = document.getElementById("shiftInfoContent");

let selectedDate = null;
let selectedPeriod = "day";
let lastInfoDate = null;
let lastInfoPeriod = null;


function timeToHours(time) {
    if (typeof time === "number") {
        return time;
    }

    if (typeof time === "string" && time.includes(":")) {
        const [hours, minutes] = time.split(":").map(Number);
        return hours + minutes / 60;
    }

    return null;
}

function formatHours(hours) {
    return `${hours.toFixed(2)} hours`;
}

// Display employees sorted by total hours worked.
function displayEmployeeTotals(employeeHours, headingText) {
    const heading = document.createElement("h5");
    heading.textContent = headingText;
    infoContent.appendChild(heading);

    if (employeeHours.size === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No assigned shifts.";
        infoContent.appendChild(empty);
        return;
    }

    // Sort employees from most hours to fewest hours.
    const sortedEmployees = Array.from(employeeHours.entries())
        .sort((a, b) => b[1] - a[1]);

    sortedEmployees.forEach(([name, hours], index) => {
        const row = document.createElement("p");
        row.textContent =
            `${index + 1}. ${name}: ${formatHours(hours)}`;

        infoContent.appendChild(row);
    });
}

//get labor for the days
async function getLaborForDates(dates) {
    const snapshot = await getDocs(collection(db, "schedule"));

    const weekdayNames = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday"
    ];

    const laborByDate = new Map();
    const assignmentsByDate = new Map();
    const employeeRefs = new Map();
    const shiftRefs = new Map();

    //set as empty if no labor exists
    dates.forEach(date => {
        const dateKey = date.format("YYYY-MM-DD");

        laborByDate.set(dateKey, {
            employeeHours: new Map(),
            totalHours: 0
        });

        assignmentsByDate.set(dateKey, []);
    });

    //look through the schedule for assigned shifts
    for (const scheduleDoc of snapshot.docs) {
        const scheduleData = scheduleDoc.data();

        if (!scheduleData.schedule || !scheduleData.scheduleID) {
            continue;
        }

        const weekStart = moment(
            scheduleData.scheduleID,
            "YYYY-MM-DD",
            true
        );

        if (!weekStart.isValid()) continue;

        weekdayNames.forEach((weekday, index) => {
            const shiftDate = weekStart.clone().add(index, "days");
            const dateKey = shiftDate.format("YYYY-MM-DD");

            if (!assignmentsByDate.has(dateKey)) return;

            const daySchedule = scheduleData.schedule[weekday];

            if (!daySchedule) return;

            for (const shift of Object.values(daySchedule)) {
                if (!shift?.Associate || !shift?.ShiftID) continue;

                assignmentsByDate.get(dateKey).push(shift);

                employeeRefs.set(
                    shift.Associate.path,
                    shift.Associate
                );

                shiftRefs.set(
                    shift.ShiftID.path,
                    shift.ShiftID
                );
            }
        });
    }

    // Fetch each unique employee and shift document only once.
    const [employeeResults, shiftResults] = await Promise.all([
        Promise.all(
            Array.from(employeeRefs.entries()).map(
                async ([path, ref]) => [path, await getDoc(ref)]
            )
        ),
        Promise.all(
            Array.from(shiftRefs.entries()).map(
                async ([path, ref]) => [path, await getDoc(ref)]
            )
        )
    ]);

    const employees = new Map(employeeResults);
    const shifts = new Map(shiftResults);

    // Calculate the labor 
    for (const [dateKey, assignments] of assignmentsByDate) {
        const labor = laborByDate.get(dateKey);

        for (const assignment of assignments) {
            const employeeDoc = employees.get(
                assignment.Associate.path
            );

            const shiftDoc = shifts.get(
                assignment.ShiftID.path
            );

            if (!employeeDoc?.exists() || !shiftDoc?.exists()) {
                continue;
            }

            const employeeName =
                employeeDoc.data().Name || "Unknown Employee";

            const shiftTime = shiftDoc.data().ShiftTime;

            if (!shiftTime) continue;

            const start = timeToHours(shiftTime.StartTime);
            const end = timeToHours(shiftTime.EndTime);

            if (start === null || end === null || end < start) {
                continue;
            }

            const hours = end - start;

            labor.employeeHours.set(
                employeeName,
                (labor.employeeHours.get(employeeName) || 0) + hours
            );

            labor.totalHours += hours;
        }
    }

    return laborByDate;
}

// Display a single days labor when on day view
async function displayDayInfo(date) {
    infoContent.textContent = "Loading shift information...";

    try {
        const laborByDate = await getLaborForDates([date]);
        const { employeeHours, totalHours } =
            laborByDate.get(date.format("YYYY-MM-DD"));

        infoContent.innerHTML = "";

        const heading = document.createElement("h4");
        heading.textContent = date.format("dddd, MMMM D, YYYY");
        infoContent.appendChild(heading);

        const total = document.createElement("p");
        total.textContent = `Total Labor: ${formatHours(totalHours)}`;
        infoContent.appendChild(total);

        const employeeHeading = document.createElement("h5");
        employeeHeading.textContent = "Employee Hours";
        infoContent.appendChild(employeeHeading);

        if (employeeHours.size === 0) {
            infoContent.appendChild(
                document.createTextNode("No assigned shifts for this day.")
            );
            return;
        }

        for (const [name, hours] of employeeHours) {
            const row = document.createElement("p");
            row.textContent = `${name}: ${formatHours(hours)}`;
            infoContent.appendChild(row);
        }

    } catch (error) {
        console.error("Error loading shift information:", error);
        infoContent.textContent =
            "Unable to load shift information. Please try again.";
    }
}

// Display a weeks labor when on week view, each day can alsoo be opended
async function displayWeekInfo(date) {
    infoContent.textContent = "Loading weekly labor information...";

    try {
        const weekStart = date.clone().startOf("week");

        const weekDays = Array.from({ length: 7 }, (_, i) =>
            weekStart.clone().add(i, "days")
        );

        //get the week
        const laborByDate = await getLaborForDates(weekDays);

        const weeklyTotal = weekDays.reduce((total, day) => {
            return total +
                laborByDate.get(day.format("YYYY-MM-DD")).totalHours;
        }, 0);

        infoContent.innerHTML = "";

        const heading = document.createElement("h4");
        heading.textContent =
            `${weekStart.format("MMM D")} – ${weekStart.clone().endOf("week").format("MMM D, YYYY")}`;
        infoContent.appendChild(heading);

        const total = document.createElement("h5");
        total.textContent = `Total Weekly Labor: ${formatHours(weeklyTotal)}`;
        infoContent.appendChild(total);

        // Calculate each employee's total hours for the week.
        const weeklyEmployeeHours = new Map();

        weekDays.forEach(day => {
            const labor = laborByDate.get(day.format("YYYY-MM-DD"));

            for (const [name, hours] of labor.employeeHours) {
                weeklyEmployeeHours.set(
                    name,
                    (weeklyEmployeeHours.get(name) || 0) + hours
                );
            }
        });

        displayEmployeeTotals(
            weeklyEmployeeHours,
            "Employee Weekly Hours"
        );

        weekDays.forEach(day => {
            const labor = laborByDate.get(day.format("YYYY-MM-DD"));

            const details = document.createElement("details");
            details.open = day.isSame(moment(), "day");

            const summary = document.createElement("summary");
            summary.textContent =
                `${day.format("dddd, MMM D")} — ${formatHours(labor.totalHours)}`;

            details.appendChild(summary);

            if (labor.employeeHours.size === 0) {
                const empty = document.createElement("p");
                empty.textContent = "No assigned shifts.";
                details.appendChild(empty);
            } else {
                for (const [name, hours] of labor.employeeHours) {
                    const employeeRow = document.createElement("p");
                    employeeRow.textContent =
                        `${name}: ${formatHours(hours)}`;
                    details.appendChild(employeeRow);
                }
            }

            infoContent.appendChild(details);
        });

    } catch (error) {
        console.error("Error loading weekly labor information:", error);
        infoContent.textContent =
            "Unable to load weekly labor information.";
    }
}

// Display a months labor when on day view
async function displayMonthInfo(date) {
    infoContent.textContent = "Loading monthly labor information...";

    try {
        const monthStart = date.clone().startOf("month");
        const numberOfDays = date.daysInMonth();

        const monthDays = Array.from({ length: numberOfDays }, (_, i) =>
            monthStart.clone().add(i, "days")
        );

        //get the month
        const laborByDate = await getLaborForDates(monthDays);

        const weeks = [];
        let monthlyTotal = 0;

        monthDays.forEach(day => {
            const labor = laborByDate.get(day.format("YYYY-MM-DD"));

            const weekStart = day.clone().startOf("week");
            const weekKey = weekStart.format("YYYY-MM-DD");

            let week = weeks.find(item => item.key === weekKey);

            if (!week) {
                week = {
                    key: weekKey,
                    start: weekStart,
                    days: [],
                    totalHours: 0
                };

                weeks.push(week);
            }

            week.days.push({
                date: day,
                employeeHours: labor.employeeHours,
                totalHours: labor.totalHours
            });

            week.totalHours += labor.totalHours;
            monthlyTotal += labor.totalHours;
        });

        infoContent.innerHTML = "";

        const heading = document.createElement("h4");
        heading.textContent = date.format("MMMM YYYY");
        infoContent.appendChild(heading);

        const total = document.createElement("h5");
        total.textContent =
            `Total Monthly Labor: ${formatHours(monthlyTotal)}`;
        infoContent.appendChild(total);

        // Calculate each employee's total hours for the month.
        const monthlyEmployeeHours = new Map();

        monthDays.forEach(day => {
            const labor = laborByDate.get(day.format("YYYY-MM-DD"));

            for (const [name, hours] of labor.employeeHours) {
                monthlyEmployeeHours.set(
                    name,
                    (monthlyEmployeeHours.get(name) || 0) + hours
                );
            }
        });

        displayEmployeeTotals(
            monthlyEmployeeHours,
            "Employee Monthly Hours"
        );

        weeks.forEach(week => {
            const weekDetails = document.createElement("details");

            const containsToday = week.days.some(day =>
                day.date.isSame(moment(), "day")
            );

            weekDetails.open = containsToday;

            const weekSummary = document.createElement("summary");
            const weekEnd = week.days[week.days.length - 1].date;

            weekSummary.textContent =
                `${week.start.format("MMM D")} – ${weekEnd.format("MMM D")} ` +
                `— ${formatHours(week.totalHours)}`;

            weekDetails.appendChild(weekSummary);

            week.days.forEach(dayInfo => {
                const dayDetails = document.createElement("details");

                dayDetails.open =
                    dayInfo.date.isSame(moment(), "day");

                const daySummary = document.createElement("summary");
                daySummary.textContent =
                    `${dayInfo.date.format("dddd, MMM D")} ` +
                    `— ${formatHours(dayInfo.totalHours)}`;

                dayDetails.appendChild(daySummary);

                if (dayInfo.employeeHours.size === 0) {
                    const empty = document.createElement("p");
                    empty.textContent = "No assigned shifts.";
                    dayDetails.appendChild(empty);
                } else {
                    for (const [name, hours] of dayInfo.employeeHours) {
                        const employeeRow = document.createElement("p");
                        employeeRow.textContent =
                            `${name}: ${formatHours(hours)}`;
                        dayDetails.appendChild(employeeRow);
                    }
                }

                weekDetails.appendChild(dayDetails);
            });

            infoContent.appendChild(weekDetails);
        });

    } catch (error) {
        console.error("Error loading monthly labor information:", error);
        infoContent.textContent =
            "Unable to load monthly labor information.";
    }
}


// update the panel based on the calendar view
function updateShiftInfo(forceUpdate = false) {
    const calendar = window.scheduleCalendar;

    if (!calendar) return;

    selectedDate = calendar.current.clone();
    selectedPeriod = calendar.calendarPeriod;

    const currentDateKey = selectedDate.format("YYYY-MM-DD");

    // Ignore redraws caused only by switching List/Calendar view.
    if (
        !forceUpdate &&
        currentDateKey === lastInfoDate &&
        selectedPeriod === lastInfoPeriod
    ) {
        return;
    }

    lastInfoDate = currentDateKey;
    lastInfoPeriod = selectedPeriod;

    if (selectedPeriod === "day") {
        displayDayInfo(selectedDate);
    } else if (selectedPeriod === "week") {
        displayWeekInfo(selectedDate);
    } else if (selectedPeriod === "month") {
        displayMonthInfo(selectedDate);
    }
}

//open and close panel
if (infoButton && infoPanel) {
    infoButton.addEventListener("click", () => {
        infoPanel.style.display =
            infoPanel.style.display === "none" ? "block" : "none";

        if (infoPanel.style.display === "block") {
            updateShiftInfo();
        }
    });
}

if (closeButton && infoPanel) {
    closeButton.addEventListener("click", () => {
        infoPanel.style.display = "none";
    });
}

window.addEventListener("calendarViewChanged", () => {
    if (infoPanel && infoPanel.style.display !== "none") {
        updateShiftInfo();
    }
});
