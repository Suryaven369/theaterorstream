import { createBrowserRouter } from "react-router-dom";
import App from "../App";

// views
import Home from "../views/Home";
import Explore from "../views/Explore";
import Details from "../views/Details";
import Search from "../views/Search";
import UpcomingPage from "../views/upcoming";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        path: "",
        element: <Home />,
      },
      {
        path: "upcoming",
        element: <UpcomingPage />,
      },
      {
        path: ":explore",
        element: <Explore />,
      },
      {
        path: ":explore/:id",
        element: <Details />,
      },
      {
        path: "search",
        element: <Search />,
      },
    ],
  },
]);

export default router;
