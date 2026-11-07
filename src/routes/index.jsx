import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminRoute from "../components/AdminRoute";
import ProtectedRoute from "../components/ProtectedRoute";
import RequireAuth from "../components/RequireAuth";
import GuestRoute from "../components/GuestRoute";
import NotFound from "../components/NotFound";
import { lazyPage } from "./lazyPage";

// Eager: landing + auth (first paint)
import Home from "../views/Home";
import AuthPage from "../views/AuthPage";

// Lazy: everything else — smaller mobile JS parse on /
const Explore = lazyPage(() => import("../views/Explore"));
const Details = lazyPage(() => import("../views/Details"));
const Search = lazyPage(() => import("../views/Search"));
const CategoryBrowsePage = lazyPage(() => import("../views/CategoryBrowsePage"));
const UpcomingPage = lazyPage(() => import("../views/upcoming"));
const AdminPanel = lazyPage(() => import("../views/AdminPanel"));
const ProfilePage = lazyPage(() => import("../views/ProfilePage"));
const WatchlistPage = lazyPage(() => import("../views/WatchlistPage"));
const CollectionDetails = lazyPage(() => import("../views/CollectionDetails"));
const CollectionsPage = lazyPage(() => import("../views/CollectionsPage"));
const PostDetails = lazyPage(() => import("../views/PostDetails"));
const ThreadPage = lazyPage(() => import("../views/ThreadPage"));
const WatchedMoviesPage = lazyPage(() => import("../views/WatchedMoviesPage"));
const ActivityFeedPage = lazyPage(() => import("../views/ActivityFeedPage"));
const DiaryPage = lazyPage(() => import("../views/DiaryPage"));
const WatchPage = lazyPage(() => import("../views/WatchPage"));
const TasteSettingsPage = lazyPage(() => import("../views/TasteSettingsPage"));
const TasteOnboardingPage = lazyPage(() => import("../views/TasteOnboardingPage"));
const TasteMapPage = lazyPage(() => import("../views/TasteMapPage"));
const SettingsPage = lazyPage(() => import("../views/SettingsPage"));
const ParentGuideBrowsePage = lazyPage(() => import("../views/ParentGuideBrowsePage"));
const AdminSectionsPage = lazyPage(() => import("../views/admin/AdminSectionsPage"));
const AdminTrailersPage = lazyPage(() => import("../views/admin/AdminTrailersPage"));
const AdminArticlesPage = lazyPage(() => import("../views/admin/AdminArticlesPage"));
const AdminCollectionsPage = lazyPage(() => import("../views/admin/AdminCollectionsPage"));
const AdminFranchiseListsPage = lazyPage(() => import("../views/admin/AdminFranchiseListsPage"));
const AdminSettingsPage = lazyPage(() => import("../views/admin/AdminSettingsPage"));
const AdminProfileConnectPage = lazyPage(() => import("../views/admin/AdminProfileConnectPage"));
const AdminControlTowerPage = lazyPage(() => import("../views/admin/AdminControlTowerPage"));
const AdminDashboardPage = lazyPage(() => import("../views/admin/AdminDashboardPage"));
const ResetPasswordPage = lazyPage(() => import("../views/ResetPasswordPage"));
const AboutPage = lazyPage(() => import("../views/LegalPages").then((m) => ({ default: m.AboutPage })));
const PrivacyPage = lazyPage(() => import("../views/LegalPages").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazyPage(() => import("../views/LegalPages").then((m) => ({ default: m.TermsPage })));
const AttributionsPage = lazyPage(() => import("../views/LegalPages").then((m) => ({ default: m.AttributionsPage })));

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
    // Public shell — guests can browse feed, catalog, search, movie details
    path: "/",
    element: <App />,
    children: [
      {
        path: "",
        element: <Home />,
      },
      {
        path: "about",
        element: <AboutPage />,
      },
      {
        path: "privacy",
        element: <PrivacyPage />,
      },
      {
        path: "terms",
        element: <TermsPage />,
      },
      {
        path: "attributions",
        element: <AttributionsPage />,
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
        element: <Navigate to="/?tab=explore" replace />,
      },
      {
        path: "search",
        element: <Search />,
      },
      {
        path: "browse/:kind/:id",
        element: <CategoryBrowsePage />,
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
        path: ":username/profile",
        element: <ProfilePage />,
      },
      // Public profile sub-pages — guests can browse another user's public content
      {
        path: ":username/watchlist",
        element: <WatchlistPage />,
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
        path: ":username/diary",
        element: <DiaryPage />,
      },
      // Public shareable pages (OG crawlers + guests can open shared links)
      {
        path: "collection/:slug",
        element: <CollectionDetails />,
      },
      {
        path: "thread/:feedId",
        element: <ThreadPage />,
      },
      {
        path: "post/:id",
        element: <PostDetails />,
      },
      {
        path: "parent-guide",
        element: <ParentGuideBrowsePage />,
      },
      {
        path: "parent-guide/:category",
        element: <ParentGuideBrowsePage />,
      },

      // Signed-in only — listed before :explore catch-alls
      {
        element: <RequireAuth />,
        children: [
          {
            path: "watch",
            element: <WatchPage />,
          },
          {
            path: "profile",
            element: <ProfilePage />,
          },
          {
            path: "settings",
            element: <SettingsPage />,
          },
          {
            path: "settings/taste",
            element: <TasteSettingsPage />,
          },
          {
            path: "onboarding/taste",
            element: <TasteOnboardingPage />,
          },
          {
            path: "taste-map",
            element: <TasteMapPage />,
          },
          {
            path: "diary",
            element: <DiaryPage />,
          },
        ],
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
            element: <AdminDashboardPage />,
          },
          {
            path: "dashboard",
            element: <AdminDashboardPage />,
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
            path: "trailers",
            element: <AdminTrailersPage />,
          },
          {
            path: "articles",
            element: <AdminArticlesPage />,
          },
          {
            path: "collections",
            element: <AdminCollectionsPage />,
          },
          {
            path: "franchise-lists",
            element: <AdminFranchiseListsPage />,
          },
          {
            path: "settings",
            element: <AdminSettingsPage />,
          },
          {
            path: "settings/profile-connect",
            element: <AdminProfileConnectPage />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);

export default router;
