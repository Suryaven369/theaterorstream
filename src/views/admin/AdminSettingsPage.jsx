import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

const AdminSettingsPage = () => {
    const { user, profile } = useAuth();
    const [saved, setSaved] = useState(false);

    // Settings state
    const [settings, setSettings] = useState({
        siteName: "TheaterOrStream",
        siteDescription: "Discover what to watch and where to stream it",
        defaultRegion: "IN",
        maxSectionsHome: 10,
        cacheTimeout: 3600,
        enableReviews: true,
        enableRatings: true,
        enableWatchlist: true,
        enableCollections: true,
    });

    const handleSave = () => {
        // In a real app, save to database
        localStorage.setItem('admin_settings', JSON.stringify(settings));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const regions = [
        { code: "IN", name: "India" },
        { code: "US", name: "United States" },
        { code: "GB", name: "United Kingdom" },
        { code: "CA", name: "Canada" },
        { code: "AU", name: "Australia" },
    ];

    return (
        <div className="p-6 max-w-4xl">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white">⚙️ Settings</h1>
                <p className="text-white/50 text-sm">Configure site settings and preferences</p>
            </div>

            {/* Admin Info */}
            <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-3">Admin Account</h3>
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                        {profile?.username?.[0]?.toUpperCase() || "A"}
                    </div>
                    <div>
                        <div className="text-white font-medium">{profile?.display_name || profile?.username || "Admin"}</div>
                        <div className="text-white/50 text-sm">{user?.email}</div>
                    </div>
                    <span className="ml-auto px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs font-medium">
                        Admin
                    </span>
                </div>
            </div>

            {/* Site Settings */}
            <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4">Site Settings</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-white/60 text-sm mb-1">Site Name</label>
                        <input
                            type="text"
                            value={settings.siteName}
                            onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                            className="w-full bg-black/30 rounded-lg px-4 py-2.5 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-white/60 text-sm mb-1">Site Description</label>
                        <textarea
                            value={settings.siteDescription}
                            onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                            rows={2}
                            className="w-full bg-black/30 rounded-lg px-4 py-2.5 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none resize-none"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-white/60 text-sm mb-1">Default Region</label>
                            <select
                                value={settings.defaultRegion}
                                onChange={(e) => setSettings({ ...settings, defaultRegion: e.target.value })}
                                className="w-full bg-black/30 rounded-lg px-4 py-2.5 text-sm text-white border border-white/10"
                            >
                                {regions.map(r => (
                                    <option key={r.code} value={r.code}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-white/60 text-sm mb-1">Max Homepage Sections</label>
                            <input
                                type="number"
                                value={settings.maxSectionsHome}
                                onChange={(e) => setSettings({ ...settings, maxSectionsHome: parseInt(e.target.value) })}
                                className="w-full bg-black/30 rounded-lg px-4 py-2.5 text-sm text-white border border-white/10"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Feature Toggles */}
            <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-4">Features</h3>
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { key: "enableReviews", label: "User Reviews", icon: "💬" },
                        { key: "enableRatings", label: "User Ratings", icon: "⭐" },
                        { key: "enableWatchlist", label: "Watchlist", icon: "📋" },
                        { key: "enableCollections", label: "Collections", icon: "🎬" },
                    ].map(feature => (
                        <label key={feature.key} className="flex items-center gap-3 p-3 bg-black/20 rounded-lg cursor-pointer hover:bg-black/30 transition-colors">
                            <span className="text-xl">{feature.icon}</span>
                            <span className="flex-1 text-white text-sm">{feature.label}</span>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={settings[feature.key]}
                                    onChange={(e) => setSettings({ ...settings, [feature.key]: e.target.checked })}
                                    className="sr-only"
                                />
                                <div className={`w-10 h-6 rounded-full transition-colors ${settings[feature.key] ? "bg-green-500" : "bg-white/20"}`}>
                                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings[feature.key] ? "translate-x-5" : "translate-x-1"}`} />
                                </div>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-500/5 rounded-xl p-4 mb-6 border border-red-500/20">
                <h3 className="text-sm font-medium text-red-400 mb-3">Danger Zone</h3>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-white text-sm">Clear Cache</p>
                        <p className="text-white/40 text-xs">Remove all cached data from local storage</p>
                    </div>
                    <button
                        onClick={() => {
                            localStorage.clear();
                            alert("Cache cleared!");
                        }}
                        className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    className={`px-8 py-3 rounded-lg text-sm font-medium transition-all ${saved
                        ? "bg-green-500 text-white"
                        : "bg-orange-500 text-white hover:bg-orange-600"
                        }`}
                >
                    {saved ? "✓ Saved!" : "Save Settings"}
                </button>
            </div>
        </div>
    );
};

export default AdminSettingsPage;
