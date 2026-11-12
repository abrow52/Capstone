//this is where we are going to put all the code to grab from the database
import {db} from "./firebase.js";
import {collection, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


const snapshot = await getDocs(collection(db, "userInfo"));

const currentUserID = sessionStorage.getItem("userID");
const currentUserName = sessionStorage.getItem("Name");
const currentTitle = sessionStorage.getItem("Title");

if(currentTitle === "Manager"){
    document.getElementById("managerLink").style.display = "block";
  }

if (currentUserName) {
  //display the username on the home page
  document.getElementById("welcomeUsername").textContent = currentUserName;
}

//this is a template i found
!function() {

  var today = moment();

  function Calendar(selector, events) {
    this.el = document.querySelector(selector);
    this.events = events;
    this.current = moment().date(1);
    this.draw();
    var current = document.querySelector('.today');
  }

  Calendar.prototype.draw = function() {
    this.drawHeader();

    if (this.view === 'list') {
      // Remove the traditional month grid
      if (this.month) {
        this.month.remove();
        this.month = null;
      }

      if (this.weekHeader) {
        this.weekHeader.remove();
        this.weekHeader = null;
      }

      this.drawAgenda();
    } else {
      // Remove the agenda when returning to calendar mode
      if (this.agenda) {
        this.agenda.remove();
        this.agenda = null;
      }

      this.drawWeekHeader();
      this.drawMonth();
    }
  };


  Calendar.prototype.drawHeader = function() {
    var self = this;
    if(!this.header) {
      //Create the header elements
      this.header = createElement('div', 'header');
      this.header.className = 'header';

      this.title = createElement('h1');

      var right = createElement('div', 'right');
      right.addEventListener('click', function() { self.nextMonth(); });

      var left = createElement('div', 'left');
      left.addEventListener('click', function() { self.prevMonth(); });

      //Append the Elements
      this.header.appendChild(this.title); 
      this.header.appendChild(right);
      this.header.appendChild(left);
      this.el.appendChild(this.header);
    }

    this.title.innerHTML = this.current.format('MMMM YYYY');
  }

  Calendar.prototype.drawWeekHeader = function() {
    if (!this.weekHeader) {
        // Create the weekday header container
        this.weekHeader = createElement('div', 'weekHeader');

        // Weekday names
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Create each weekday column
        days.forEach(function(day) {
            var dayElement = createElement('div', 'weekday');
            dayElement.textContent = day;
            this.weekHeader.appendChild(dayElement);
        }, this);

        // Add the weekday row to the calendar
        this.el.appendChild(this.weekHeader);
    }
};

  Calendar.prototype.drawMonth = function() {
    var self = this;
    
    if(this.month) {
      this.oldMonth = this.month;
      this.oldMonth.className = 'month out ' + (self.next ? 'next' : 'prev');
      this.oldMonth.addEventListener('webkitAnimationEnd', function() {
        self.oldMonth.parentNode.removeChild(self.oldMonth);
        self.month = createElement('div', 'month');
        self.backFill();
        self.currentMonth();
        self.fowardFill();
        self.el.appendChild(self.month);
        window.setTimeout(function() {
          self.month.className = 'month in ' + (self.next ? 'next' : 'prev');
        }, 16);
      });
    } else {
        this.month = createElement('div', 'month');
        this.el.appendChild(this.month);
        this.backFill();
        this.currentMonth();
        this.fowardFill();
        this.month.className = 'month new';
    }
  }

  Calendar.prototype.backFill = function() {
    var clone = this.current.clone();
    var dayOfWeek = clone.day();

    if(!dayOfWeek) { return; }

    clone.subtract('days', dayOfWeek+1);

    for(var i = dayOfWeek; i > 0 ; i--) {
      this.drawDay(clone.add('days', 1));
    }
  }

  Calendar.prototype.fowardFill = function() {
    var clone = this.current.clone().add('months', 1).subtract('days', 1);
    var dayOfWeek = clone.day();

    if(dayOfWeek === 6) { return; }

    for(var i = dayOfWeek; i < 6 ; i++) {
      this.drawDay(clone.add('days', 1));
    }
  }

  Calendar.prototype.currentMonth = function() {
    var clone = this.current.clone();

    while(clone.month() === this.current.month()) {
      this.drawDay(clone);
      clone.add('days', 1);
    }
  }

  Calendar.prototype.getWeek = function(day) {
    if(!this.week || day.day() === 0) {
      this.week = createElement('div', 'week');
      this.month.appendChild(this.week);
    }
  }

  Calendar.prototype.drawDay = function(day) {
    var self = this;
    this.getWeek(day);

    //Outer Day
    var outer = createElement('div', this.getDayClass(day));
    outer.addEventListener('click', function() {
      self.openDay(this);
    });

    //Day Name
    var name = createElement('div', 'day-name', day.format('ddd'));

    //Day Number
    var number = createElement('div', 'day-number', day.format('DD'));


    //Events
    var events = createElement('div', 'day-events');
    this.drawEvents(day, events);

    outer.appendChild(name);
    outer.appendChild(number);
    outer.appendChild(events);
    this.week.appendChild(outer);
  }

  Calendar.prototype.drawEvents = function(day, element) {
    if(day.month() === this.current.month()) {
      var todaysEvents = this.events.reduce(function(memo, ev) {
        if(ev.date.isSame(day, 'day')) {
          memo.push(ev);
        }
        return memo;
      }, []);

      // todaysEvents.forEach(function(ev) {
      //   var evSpan = createElement('span', ev.color);
      //   element.appendChild(evSpan);
      // });
      todaysEvents.forEach(function(ev) {
          var evSpan = createElement('div', 'calendar-event');
      
          var colorSquare = createElement(
              'span',
              'event-category ' + ev.color
          );
      
          var eventName = createElement(
              'span',
              'calendar-event-name',
              ev.eventName
          );
      
          evSpan.appendChild(colorSquare);
          evSpan.appendChild(eventName);

          evSpan.addEventListener('click', function(event) {
              event.stopPropagation();
      
              if (window.isScheduleMode && window.selectShiftForScheduling) {
                  window.selectShiftForScheduling(ev);
              }
          });
      
          element.appendChild(evSpan);
          evSpan.dataset.shiftKey = `${ev.date.format("YYYY-MM-DD")}|${ev.shiftID}`;
      });
    }
  }


  Calendar.prototype.drawAgenda = function() {
    // Rebuild the list whenever the month changes
    if (this.agenda) {
      this.agenda.remove();
    }

    this.agenda = createElement('div', 'agenda-list');

    const daysInMonth = this.current.daysInMonth();

    for (let i = 1; i <= daysInMonth; i++) {
      const day = this.current.clone().date(i);

      const row = createElement('div', 'agenda-row');

      if (day.isSame(today, 'day')) {
        row.classList.add('is-today');
      }

      // Left column: date
      const dateColumn = createElement('div', 'agenda-date');

      const weekday = createElement(
        'div',
        'agenda-weekday',
        day.format('ddd')
      );

      const dateNumber = createElement(
        'div',
        'agenda-day-number',
        day.format('D')
      );

      dateColumn.appendChild(weekday);
      dateColumn.appendChild(dateNumber);

      // Right column: every event on this date
      const eventsColumn = createElement('div', 'agenda-events');

      const todaysEvents = this.events.filter(function(ev) {
        return ev.date.isSame(day, 'day');
      });

      if (todaysEvents.length === 0) {
        eventsColumn.appendChild(
          createElement('div', 'agenda-empty', 'No shifts scheduled')
        );
      } else {
        todaysEvents.forEach(function(ev) {
          const eventRow = createElement('div', 'agenda-event');
          eventRow.dataset.shiftKey =
            `${ev.date.format("YYYY-MM-DD")}|${ev.shiftID}`;
            eventRow.addEventListener("click", function(event) {
              event.stopPropagation();
          
              if (window.isScheduleMode && window.selectShiftForScheduling) {
                  window.selectShiftForScheduling(ev);
              }
          });

          const colorSquare = createElement(
            'span',
            'event-category ' + ev.color
          );

          const eventName = createElement(
            'span',
            'agenda-event-name',
            ev.eventName
          );

          eventRow.appendChild(colorSquare);
          eventRow.appendChild(eventName);
          eventsColumn.appendChild(eventRow);
        });
      }

      row.appendChild(dateColumn);
      row.appendChild(eventsColumn);

      this.agenda.appendChild(row);
    }

    this.el.appendChild(this.agenda);
  };


  Calendar.prototype.toggleView = function() {
    this.view = this.view === 'list' ? 'calendar' : 'list';

    this.el.classList.toggle(
      'list-view',
      this.view === 'list'
    );

    this.draw();
  };


  Calendar.prototype.getDayClass = function(day) {
    var classes = ['day'];
    if(day.month() !== this.current.month()) {
      classes.push('other');
    } else if (today.isSame(day, 'day')) {
      classes.push('today');
    }
    return classes.join(' ');
  }

  // Calendar.prototype.openDay = function(el) {
  //   var details, arrow;
  //   var dayNumber = +el.querySelectorAll('.day-number')[0].innerText || +el.querySelectorAll('.day-number')[0].textContent;
  //   var day = this.current.clone().date(dayNumber);

  //   var currentOpened = document.querySelector('.details');

  //   //Check to see if there is an open detais box on the current row
  //   if(currentOpened && currentOpened.parentNode === el.parentNode) {
  //       //   details = currentOpened;
  //       //   arrow = document.querySelector('.arrow');
  //       // Close the dropdown when clicking the same day again
  //       currentOpened.className = 'details out';

  //       currentOpened.addEventListener('animationend', function() {
  //           if (currentOpened.parentNode) {
  //               currentOpened.parentNode.removeChild(currentOpened);
  //           }
  //   });

  //   return;
  //   } else {
  //     //Close the open events on differnt week row
  //     //currentOpened && currentOpened.parentNode.removeChild(currentOpened);
  //     if(currentOpened) {
  //       currentOpened.addEventListener('webkit                AnimationEnd', function() {
  //         currentOpened.parentNode.removeChild(currentOpened);
  //       });
  //       currentOpened.addEventListener('oanimationend', function() {
  //         currentOpened.parentNode.removeChild(currentOpened);
  //       });
  //       currentOpened.addEventListener('msAnimationEnd', function() {
  //         currentOpened.parentNode.removeChild(currentOpened);
  //       });
  //       currentOpened.addEventListener('animationend', function() {
  //         currentOpened.parentNode.removeChild(currentOpened);
  //       });
  //       currentOpened.className = 'details out';
  //     }

  //     //Create the Details Container
  //     details = createElement('div', 'details in');

  //     //Create the arrow
  //     var arrow = createElement('div', 'arrow');

  //     //Create the event wrapper

  //     details.appendChild(arrow);
  //     el.parentNode.appendChild(details);
  //   }

  //   var todaysEvents = this.events.reduce(function(memo, ev) {
  //     if(ev.date.isSame(day, 'day')) {
  //       memo.push(ev);
  //     }
  //     return memo;
  //   }, []);

  //   this.renderEvents(todaysEvents, details);

  //   arrow.style.left = el.offsetLeft - el.parentNode.offsetLeft + 40 + 'px';
  // }

  Calendar.prototype.renderEvents = function(events, ele) {
    //Remove any events in the current details element
    var currentWrapper = ele.querySelector('.events');
    var wrapper = createElement('div', 'events in' + (currentWrapper ? ' new' : ''));

    events.forEach(function(ev) {
      var div = createElement('div', 'event');
      var square = createElement('div', 'event-category ' + ev.color);
      var span = createElement('span', '', ev.eventName);

      div.appendChild(square);
      div.appendChild(span);
      wrapper.appendChild(div);
    });

    if(!events.length) {
      var div = createElement('div', 'event empty');
      var span = createElement('span', '', 'No Events');

      div.appendChild(span);
      wrapper.appendChild(div);
    }

    if(currentWrapper) {
      currentWrapper.className = 'events out';
      currentWrapper.addEventListener('webkitAnimationEnd', function() {
        currentWrapper.parentNode.removeChild(currentWrapper);
        ele.appendChild(wrapper);
      });
      currentWrapper.addEventListener('oanimationend', function() {
        currentWrapper.parentNode.removeChild(currentWrapper);
        ele.appendChild(wrapper);
      });
      currentWrapper.addEventListener('msAnimationEnd', function() {
        currentWrapper.parentNode.removeChild(currentWrapper);
        ele.appendChild(wrapper);
      });
      currentWrapper.addEventListener('animationend', function() {
        currentWrapper.parentNode.removeChild(currentWrapper);
        ele.appendChild(wrapper);
      });
    } else {
      ele.appendChild(wrapper);
    }
  }

  // Calendar.prototype.nextMonth = function() {
  //   this.current.add('months', 1);
  //   this.next = true;
  //   this.draw();
  // }
  Calendar.prototype.nextMonth = function() {
    this.current.add('months', 1);
    this.next = true;

    if (this.onMonthChange) {
        this.onMonthChange();
    }

    this.draw();
  }

  // Calendar.prototype.prevMonth = function() {
  //   this.current.subtract('months', 1);
  //   this.next = false;
  //   this.draw();
  // }
  Calendar.prototype.prevMonth = function() {
    this.current.subtract('months', 1);
    this.next = false;

    if (this.onMonthChange) {
        this.onMonthChange();
    }

    this.draw();
  }

  window.Calendar = Calendar;

  function createElement(tagName, className, innerText) {
    var ele = document.createElement(tagName);
    if(className) {
      ele.className = className;
    }
    if(innerText) {
      ele.innderText = ele.textContent = innerText;
    }
    return ele;
  }
}();

async function loadCalendarEvents() {
  const currentUserID = sessionStorage.getItem("userID");

  if (!currentUserID) {
      window.location.href = "login.html";
      return;
  }

  const showAllEmployees =
    currentTitle === "Manager" &&
    document.body.dataset.calendarView === "all";

  const snapshot = await getDocs(collection(db, "schedule"));

  console.log("Number of schedule documents:", snapshot.size);

  const weekdayOffsets = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6
  };

  // Collect assignments and unique document references first.
  const assignments = [];
  const shiftRefs = new Map();
  const employeeRefs = new Map();

  for (const scheduleDoc of snapshot.docs) {
      const scheduleData = scheduleDoc.data();
      const weeklySchedule = scheduleData.schedule;

      if (!weeklySchedule || !scheduleData.scheduleID) continue;

      const weekStart = moment(
          scheduleData.scheduleID,
          "YYYY-MM-DD",
          true
      );

      if (!weekStart.isValid()) continue;

      for (const [day, offset] of Object.entries(weekdayOffsets)) {
          const daySchedule = weeklySchedule[day];

          if (!daySchedule) continue;

          const shiftDate = weekStart.clone().add(offset, "days");

          for (const shift of Object.values(daySchedule)) {
              if (!shift?.Associate || !shift?.ShiftID) continue;

              // Employees only need to load their own assignments.
              if (
                  !showAllEmployees &&
                  shift.Associate.path !== `userInfo/${currentUserID}`
              ) {
                  continue;
              }

              assignments.push({
                  shiftID: shift.ShiftID.id,
                  shiftRef: shift.ShiftID,
                  associateID: shift.Associate.id,
                  associateRef: shift.Associate,
                  date: shiftDate.clone()
              });

              shiftRefs.set(shift.ShiftID.path, shift.ShiftID);

              // Only the manager calendar displays employee names.
              if (showAllEmployees) {
                  employeeRefs.set(
                      shift.Associate.path,
                      shift.Associate
                  );
              }
          }
      }
  }

  // Fetch all unique shift and employee documents in parallel.
  const [shiftResults, employeeResults] = await Promise.all([
      Promise.all(
          Array.from(shiftRefs.entries()).map(async ([path, ref]) => {
              const doc = await getDoc(ref);
              return [path, doc];
          })
      ),

      Promise.all(
          Array.from(employeeRefs.entries()).map(async ([path, ref]) => {
              const doc = await getDoc(ref);
              return [path, doc];
          })
      )
  ]);

  const shiftDocuments = new Map(shiftResults);
  const employeeDocuments = new Map(employeeResults);

  const data = [];

  // Build calendar events using the fetched documents.
  for (const assignment of assignments) {
      const shiftDoc = shiftDocuments.get(
          assignment.shiftRef.path
      );

      if (!shiftDoc?.exists()) continue;

      const shiftDetails = shiftDoc.data();
      const shiftTime = shiftDetails.ShiftTime;

      if (!shiftTime) continue;

      if (showAllEmployees) {
          const employeeDoc = employeeDocuments.get(
              assignment.associateRef.path
          );

          const employeeName = employeeDoc?.exists()
              ? employeeDoc.data().Name || "Unknown Employee"
              : "Unknown Employee";

          data.push({
              eventName:
                  `${formatTime(shiftTime.StartTime)} - ` +
                  `${formatTime(shiftTime.EndTime)} - ${employeeName}`,
              calendar: "Work",
              color: "blue",
              date: assignment.date,
              employeeID: assignment.associateID,
              name: employeeName,
              shiftID: assignment.shiftID
          });
      } else {
          data.push({
              eventName:
                  `${formatTime(shiftTime.StartTime)} - ` +
                  `${formatTime(shiftTime.EndTime)}`,
              calendar: "Work",
              color: "orange",
              date: assignment.date
          });
      }
  }

  window.normalCalendarEvents = data;

  window.scheduleCalendar = new Calendar("#calendar", data);

  const toggleButton = document.getElementById(
      "toggleCalendarView"
  );

  if (toggleButton && !toggleButton.dataset.listenerAdded) {
      toggleButton.dataset.listenerAdded = "true";

      toggleButton.addEventListener("click", function() {
          window.scheduleCalendar.toggleView();

          toggleButton.textContent =
              window.scheduleCalendar.view === "list"
                  ? "Switch to Calendar View"
                  : "Switch to List View";
      });
  }
}
//this is the function that gets the schedule from the db
async function loadOpenShifts() {
    const snapshot = await getDocs(collection(db, "OpenShifts"));
    const container = document.getElementById("shiftList");

    container.innerHTML = "";

    for (const openShiftDoc of snapshot.docs) {
        const openShift = openShiftDoc.data();

        // Get the date stored in OpenShifts
        const shiftDate = moment(openShift.Date, "MM/DD/YYYY");

        // Get the referenced shift document
        if (!openShift.shiftID) continue;

        const shiftDoc = await getDoc(openShift.shiftID);

        if (!shiftDoc.exists()) continue;

        const shiftDetails = shiftDoc.data();
        const shiftTime = shiftDetails.ShiftTime;

        if (!shiftTime) continue;

        // Format the date and times
        const formattedDate = shiftDate.format("MMMM D, YYYY");
        const startTime = formatTime(shiftTime.StartTime);
        const endTime = formatTime(shiftTime.EndTime);

        // Display the open shift
        container.innerHTML += `
                  <div class = "shiftInfo">
                    <div>
                      <p>Date: ${formattedDate}</p>
                      <p>Time: ${startTime} - ${endTime}</p>
                    </div>
                      <button class = "PickUpButton" type = "button"> Pick Up </button>
                  </div>
        `;
    }
}

function formatTime(time) {

  // Handle times stored as strings, such as "06:00" or "22:00".
  if (typeof time === "string" && time.includes(":")) {

      const [hours, minutes] = time.split(":").map(Number);

      const period = hours >= 12 ? "PM" : "AM";
      const displayHour = hours % 12 || 12;

      return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
  }

  // Handle times stored as numbers, such as 6 or 22.
  if (typeof time === "number") {

      const period = time >= 12 ? "PM" : "AM";
      const displayHour = time % 12 || 12;

      return `${displayHour}:00 ${period}`;
  }

  console.warn("Unexpected shift time format:", time);

  return String(time);
}

loadCalendarEvents();
loadOpenShifts();

