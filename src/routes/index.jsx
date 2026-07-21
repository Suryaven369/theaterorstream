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
const BoardsExplorePage = lazyPage(() => import("../views/BoardsExplorePage"));
const BoardDetailsPage = lazyPage(() => import("../views/BoardDetailsPage"));
const UserBoardsPage = lazyPage(() => import("../views/UserBoardsPage"));
const BlogsPage = lazyPage(() => import("../views/BlogsPage"));
const BlogDetails = lazyPage(() => import("../views/BlogDetails"));
const PostDetails = lazyPage(() => import("../views/PostDetails"));
const ThreadPage = lazyPage(() => import("../views/ThreadPage"));
const WatchedMoviesPage = lazyPage(() => import("../views/WatchedMoviesPage"));
const ActivityFeedPage = lazyPage(() => import("../views/ActivityFeedPage"));
const DiaryPage = lazyPage(() => import("../views/DiaryPage"));
const FeedPage = lazyPage(() => import("../views/FeedPage"));
const WatchPage = lazyPage(() => import("../views/WatchPage"));
const TasteSettingsPage = lazyPage(() => import("../views/TasteSettingsPage"));
const TasteMapPage = lazyPage(() => import("../views/TasteMapPage"));
const SettingsPage = lazyPage(() => import("../views/SettingsPage"));
const AchievementsPage = lazyPage(() => import("../views/AchievementsPage"));
const HashtagPage = lazyPage(() => import("../views/HashtagPage"));
const TagsDiscoverPage = lazyPage(() => import("../views/TagsDiscoverPage"));
const ParentGuideBrowsePage = lazyPage(() => import("../views/ParentGuideBrowsePage"));
const AdminSectionsPage = lazyPage(() => import("../views/admin/AdminSectionsPage"));
const AdminTrailersPage = lazyPage(() => import("../views/admin/AdminTrailersPage"));
const AdminArticlesPage = lazyPage(() => import("../views/admin/AdminArticlesPage"));
const AdminNewsIntelPage = lazyPage(() => import("../views/admin/AdminNewsIntelPage"));
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
        path: "feed",
        element: <FeedPage />,
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
