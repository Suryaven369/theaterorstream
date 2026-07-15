import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "../App";
import AdminLayout from "../components/AdminLayout";
import AdminRoute from "../components/AdminRoute";
import ProtectedRoute from "../components/ProtectedRoute";
import RequireAuth from "../components/RequireAuth";
import GuestRoute from "../components/GuestRoute";
import NotFound from "../components/NotFound";

// views
import Home from "../views/Home";
import Explore from "../views/Explore";
import Details from "../views/Details";
import Search from "../views/Search";
import UpcomingPage from "../views/upcoming";
import AdminPanel from "../views/AdminPanel";
import AuthPage from "../views/AuthPage";
import ProfilePage from "../views/ProfilePage";
import WatchlistPage from "../views/WatchlistPage";
import CollectionDetails from "../views/CollectionDetails";
import CollectionsPage from "../views/CollectionsPage";
import BoardsExplorePage from "../views/BoardsExplorePage";
import BoardDetailsPage from "../views/BoardDetailsPage";
import UserBoardsPage from "../views/UserBoardsPage";
import BlogsPage from "../views/BlogsPage";
import BlogDetails from "../views/BlogDetails";
import PostDetails from "../views/PostDetails";
import ThreadPage from "../views/ThreadPage";
import WatchedMoviesPage from "../views/WatchedMoviesPage";
import ActivityFeedPage from "../views/ActivityFeedPage";
import DiaryPage from "../views/DiaryPage";
import FeedPage from "../views/FeedPage";
import WatchPage from "../views/WatchPage";
import TasteSettingsPage from "../views/TasteSettingsPage";
import SettingsPage from "../views/SettingsPage";
import AchievementsPage from "../views/AchievementsPage";

import HashtagPage from "../views/HashtagPage";
import TagsDiscoverPage from "../views/TagsDiscoverPage";
import ParentGuideBrowsePage from "../views/ParentGuideBrowsePage";
import AdminSectionsPage from "../views/admin/AdminSectionsPage";
import AdminTrailersPage from "../views/admin/AdminTrailersPage";
import AdminArticlesPage from "../views/admin/AdminArticlesPage";
import AdminNewsIntelPage from "../views/admin/AdminNewsIntelPage";
import AdminCollectionsPage from "../views/admin/AdminCollectionsPage";
import AdminFranchiseListsPage from "../views/admin/AdminFranchiseListsPage";
import AdminSettingsPage from "../views/admin/AdminSettingsPage";
import AdminProfileConnectPage from "../views/admin/AdminProfileConnectPage";
import AdminControlTowerPage from "../views/admin/AdminControlTowerPage";
import AdminDashboardPage from "../views/admin/AdminDashboardPage";
import ResetPasswordPage from "../views/ResetPasswordPage";
import {
  AboutPage,
  PrivacyPage,
  TermsPage,
  AttributionsPage,
} from "../views/LegalPages";

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
        path: "feed",
        element: <FeedPage />,
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
        path: ":username/blogs",
        element: <BlogsPage />,
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
      {
        path: ":username/achievements",
        element: <AchievementsPage />,
      },
      // Public shareable pages (OG crawlers + guests can open shared links)
      {
        path: "boards",
        element: <BoardsExplorePage />,
      },
      {
        path: "boards/:slug",
        element: <BoardDetailsPage />,
      },
      {
        path: ":username/boards/:slug",
        element: <BoardDetailsPage />,
      },
      {
        path: ":username/boards",
        element: <UserBoardsPage />,
      },
      {
        path: "collection/:slug",
        element: <CollectionDetails />,
      },
      {
        path: "blog/:id",
        element: <BlogDetails />,
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
        path: "tag/:slug",
        element: <HashtagPage />,
      },
      {
        path: "tags",
        element: <TagsDiscoverPage />,
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
            path: "achievements",
            element: <AchievementsPage />,
          },
          {
            path: "settings/taste",
            element: <TasteSettingsPage />,
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
            path: "legacy",
            element: <AdminPanel />,
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
            path: "news-intel",
            element: <AdminNewsIntelPage />,
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
