import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminRoute from "../components/AdminRoute";

// views
import Home from "../views/Home";
import Explore from "../views/Explore";
import Details from "../views/Details";
import Search from "../views/Search";
import UpcomingPage from "../views/upcoming";
import TVSeries from "../views/TVSeries";
import AdminPanel from "../views/AdminPanel";
import AuthPage from "../views/AuthPage";
import OnboardingPage from "../views/OnboardingPage";
import ProfilePage from "../views/ProfilePage";
import WatchlistPage from "../views/WatchlistPage";
import CollectionDetails from "../views/CollectionDetails";
import CollectionsPage from "../views/CollectionsPage";

// Admin pages
import AdminSectionsPage from "../views/admin/AdminSectionsPage";
import AdminCollectionsPage from "../views/admin/AdminCollectionsPage";
import AdminSettingsPage from "../views/admin/AdminSettingsPage";

const router = createBrowserRouter([
  // Public routes with main App layout
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
        path: "coming-soon",
        element: <UpcomingPage />,
      },
      {
        path: "tv-series",
        element: <TVSeries />,
      },
      {
        path: "auth",
        element: <AuthPage />,
      },
      {
        path: "onboarding",
        element: <OnboardingPage />,
      },
      {
        path: "profile",
        element: <ProfilePage />,
      },
      {
        path: ":username/profile",
        element: <ProfilePage />,
      },
      {
        path: ":username/watchlist",
        element: <WatchlistPage />,
      },
      {
        path: "collection/:slug",
        element: <CollectionDetails />,
      },
      {
        path: ":username/collections",
        element: <CollectionsPage />,
      },
      {
        path: "search",
        element: <Search />,
      },
      {
        path: ":explore",
        element: <Explore />,
      },
      {
        path: ":explore/:id",
        element: <Details />,
      },
    ],
  },
  // Admin routes - Protected with AdminRoute (shows 404 to non-admins)
  {
    path: "/admin",
    element: (
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    ),
    children: [
      {
        path: "",
        element: <AdminPanel />,
      },
      {
        path: "library",
        element: <AdminPanel initialTab="library" />,
      },
      {
        path: "browse",
        element: <AdminPanel initialTab="browse" />,
      },
      {
        path: "sections",
        element: <AdminSectionsPage />,
      },
      {
        path: "collections",
        element: <AdminCollectionsPage />,
      },
      {
        path: "settings",
        element: <AdminSettingsPage />,
      },
    ],
  },
]);

export default router;



