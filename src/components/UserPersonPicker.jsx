import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { searchPeople } from "../lib/peopleApi";

const AVATAR_EMOJI = {
    avatar_1: "🎬", avatar_2: "🎭", avatar_3: "🎪", avatar_4: "🌟", avatar_5: "🎯", avatar_6: "🦋",
    avatar_7: "🌈", avatar_8: "🎸", avatar_9: "🎮", avatar_10: "📚", avatar_11: "🚀", avatar_12: "🎨",
};

/**
 * Dropdown shown while an "@" mention trigger is active. Searches app users
 * (mention links to their profile) and TMDB people — directors/actors (mention
 * links to their work). Selecting inserts the matching token via onInsert.
 */
const UserPersonPicker = ({ query, onInsert, onClose }) => {
    const [users, setUsers] = useState([]);
    const [people, setPeople] = useState([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef(null);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        const q = query.trim();
        if (q.length < 2) { setUsers([]); setPeople([]); setLoading(false); return; }
        setLoading(true);
        const safeQ = q.replace(/[%,()*]/g, " ").trim();
        debounceRef.current = setTimeout(async () => {
            const [u, p] = await Promise.all([
                supabase
                    .from("user_profiles")
                    .select("id, username, display_name, avatar_url, avatar_id")
                    .or(`username.ilike.%${safeQ}%,display_name.ilike.%${safeQ}%`)
                    .not("username", "is", null)
                    .limit(5),
                searchPeople(safeQ, { limit: 6 }),
            ]);
            setUsers(u.data || []);
            setPeople(p || []);
            setLoading(false);
        }, 250);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    const empty = !loading && users.length === 0 && people.length === 0;

    return (
        <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute left-0 right-0 top-full mt-1 z-[60] max-h-[min(22rem,55vh)] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        >
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <span className="text-[11px] text-white/40">{query.trim() ? `Mention "${query.trim()}"` : "Mention a user or person…"}</span>
                <button type="button" onClick={onClose} className="text-white/30 hover:text-white text-xs">Esc</button>
            </div>

            {query.trim().length > 0 && query.trim().length < 2 ? (
                <div className="p-3 text-xs text-white/40">Keep typing to search…</div>
            ) : loading ? (
                <div className="p-3 text-xs text-white/40">Searching…</div>
            ) : empty ? (
                <div className="p-3 text-xs text-white/40">{query.trim() ? "No matches found." : "Type a name to search."}</div>
            ) : (
                <div className="max-h-[min(18rem,45vh)] overflow-y-auto overscroll-contain">
                    {users.length > 0 && (
                        <>
                            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/30">Users</p>
                            {users.map((u) => (
                                <button
                                    key={u.id}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => onInsert({ mentionType: "user", ...u })}
                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left transition-colors"
                                >
                                    <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xs shrink-0">
                                        {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (AVATAR_EMOJI[u.avatar_id] || "👤")}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-white truncate">{u.display_name || u.username}</p>
                                        <p className="text-[11px] text-white/40">@{u.username}</p>
                                    </div>
                                </button>
                            ))}
                        </>
                    )}
                    {people.length > 0 && (
                        <>
                            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/30">Cast & Crew</p>
                            {people.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => onInsert({ mentionType: "person", ...p })}
                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left transition-colors"
                                >
                                    <div className="w-7 h-9 rounded overflow-hidden bg-black flex items-center justify-center text-xs shrink-0">
                                        {p.profile_path ? <img src={`https://image.tmdb.org/t/p/w92${p.profile_path}`} alt="" className="w-full h-full object-cover" /> : "🎭"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-white truncate">{p.name}</p>
                                        <p className="text-[11px] text-white/40 truncate">{p.known_for_department || "Acting"}{p.known_for?.length ? ` · ${p.known_for[0]}` : ""}</p>
                                    </div>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default UserPersonPicker;
