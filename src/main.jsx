import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

import { RouterProvider } from "react-router-dom";
import router from "./routes";

import { Provider } from "react-redux";
import { store } from "./store/store.jsx";

import { AuthProvider } from "./context/AuthContext.jsx";
import { ToastProvider } from "./components/Toast.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router}>
            <App />
          </RouterProvider>
        </ToastProvider>
      </AuthProvider>
    </Provider>
  </React.StrictMode>
);
