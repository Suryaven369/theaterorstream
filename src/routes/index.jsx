import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminRoute from "../components/AdminRoute";
import ProtectedRoute from "../components/ProtectedRoute";
import GuestRoute from "../components/GuestRoute";

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
import WatchedMoviesPage from "../views/WatchedMoviesPage";
import ActivityFeedPage from "../views/ActivityFeedPage";

import AdminSectionsPage from "../views/admin/AdminSectionsPage";
import AdminCollectionsPage from "../views/admin/AdminCollectionsPage";
import AdminSettingsPage from "../views/admin/AdminSettingsPage";
import AdminControlTowerPage from "../views/admin/AdminControlTowerPage";
import ResetPasswordPage from "../views/ResetPasswordPage";

const router = createBrowserRouter([
  {
    path: "/auth",
    element: (
      <GuestRoute>
        <AuthPage />
      </GuestRoute>
    ),
  },
  {
    path: "/reset-password",
    element: <ResetPasswordPage />,
  },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
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
            path: ":username/watched",
            element: <WatchedMoviesPage />,
          },
          {
            path: ":username/activity",
            element: <ActivityFeedPage />,
          },
          {
            path: "search",
            element: <Search />,
          },
          {
            path: "movies/:slug",
            element: <Details />,
          },
          {
            path: "tv/:slug",
            element: <Details />,
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
    ],
  },
  {
    path: "/admin",
    element: <ProtectedRoute />,
    children: [
      {
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
            path: "pipeline",
            element: <AdminControlTowerPage />,
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
    ],
  },
]);

export default router;
