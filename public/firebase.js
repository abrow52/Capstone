// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDf2OfUJFJPbHyJJgLRpYMCvspvoXhEirs",
  authDomain: "capstone-project-15eaf.firebaseapp.com",
  databaseURL: "https://capstone-project-15eaf-default-rtdb.firebaseio.com",
  projectId: "capstone-project-15eaf",
  storageBucket: "capstone-project-15eaf.firebasestorage.app",
  messagingSenderId: "609118337266",
  appId: "1:609118337266:web:bd64b747e398de725f386b",
  measurementId: "G-R6KLBY2H6M"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);