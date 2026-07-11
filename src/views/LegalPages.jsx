import { Link, useLocation } from 'react-router-dom';
import SeoHead from '../components/SeoHead';

const UPDATED = 'July 10, 2026';
const SITE = 'https://www.theaterorstream.com';
const CONTACT = 'support@theaterorstream.com';

const NAV = [
    { to: '/about', label: 'About' },
    { to: '/privacy', label: 'Privacy' },
    { to: '/terms', label: 'Terms' },
    { to: '/attributions', label: 'Attributions' },
];

function Shell({ title, description, children }) {
    const { pathname } = useLocation();
    return (
        <div className="min-h-screen">
            <SeoHead
                title={`${title} · Theater or Stream`}
                description={description}
                url={`${SITE}${pathname}`}
            />
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-20">
                <nav className="flex flex-wrap gap-2 mb-8">
                    {NAV.map((item) => (
                        <Link
                            key={item.to}
                            to={item.to}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                pathname === item.to
                                    ? 'bg-white/10 border-white/20 text-white'
                                    : 'border-white/10 text-white/45 hover:text-white/80 hover:border-white/20'
                            }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35 mb-3">Legal</p>
                <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight mb-2">{title}</h1>
                <p className="text-sm text-white/40 mb-10">Last updated {UPDATED}</p>
                <div className="legal-prose space-y-8 text-[15px] leading-relaxed text-white/65">
                    {children}
                </div>
            </div>
        </div>
    );
}

function H({ children }) {
    return <h2 className="text-lg font-semibold text-white mt-2 mb-3">{children}</h2>;
}

function P({ children }) {
    return <p className="mb-3">{children}</p>;
}

function Ul({ items }) {
    return (
        <ul className="list-disc pl-5 space-y-2 mb-3 marker:text-white/30">
            {items.map((item) => (
                <li key={item}>{item}</li>
            ))}
        </ul>
    );
}

export function AboutPage() {
    return (
        <Shell
            title="About Theater or Stream"
            description="Learn about Theater or Stream — movie discovery, ratings, and a social community for film fans."
        >
            <section>
                <H>What we are</H>
                <P>
                    Theater or Stream helps you decide what to watch — in theaters or at home — with ratings,
                    reviews, watchlists, diaries, and a social feed built for movie and TV fans.
                </P>
                <P>
                    Create a profile, rate titles, follow friends and creators, build collections, and share
                    what you&apos;re watching. We combine editorial and community taste with catalog data so
                    discovery feels personal, not generic.
                </P>
            </section>
            <section>
                <H>Movie &amp; TV data</H>
                <P>
                    Title metadata, posters, cast, crew, and related information are powered in part by{' '}
                    <a
                        href="https://www.themoviedb.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/90 underline underline-offset-2 hover:text-white"
                    >
                        The Movie Database (TMDB)
                    </a>
                    . See our{' '}
                    <Link to="/attributions" className="text-white/90 underline underline-offset-2 hover:text-white">
                        attributions
                    </Link>{' '}
                    page for the full acknowledgement.
                </P>
            </section>
            <section>
                <H>Contact</H>
                <P>
                    Questions about the product, privacy, or these pages:{' '}
                    <a href={`mailto:${CONTACT}`} className="text-white/90 underline underline-offset-2 hover:text-white">
                        {CONTACT}
                    </a>
                </P>
            </section>
        </Shell>
    );
}

export function PrivacyPage() {
    return (
        <Shell
            title="Privacy Policy"
            description="How Theater or Stream collects, uses, and protects your personal and social data."
        >
            <section>
                <H>1. Overview</H>
                <P>
                    This Privacy Policy explains how Theater or Stream (&quot;we&quot;, &quot;us&quot;) handles
                    information when you use {SITE} and related apps or services (the &quot;Service&quot;).
                    By using the Service, you agree to this policy.
                </P>
            </section>
            <section>
                <H>2. Information we collect</H>
                <P>Depending on how you use the Service, we may collect:</P>
                <Ul
                    items={[
                        'Account details — email, username, display name, avatar, bio, and authentication data (via our auth provider).',
                        'Profile & taste data — favorite films/shows, directors, preferences, and taste settings you choose.',
                        'Activity — ratings, reviews, diary logs, watchlist/watched status, collections, blogs, posts, comments, likes, and follows.',
                        'Usage data — pages viewed, search queries, device/browser type, approximate region, and similar analytics (including Google Analytics where enabled).',
                        'Communications — messages you send us (e.g. support email).',
                    ]}
                />
            </section>
            <section>
                <H>3. How we use information</H>
                <Ul
                    items={[
                        'Provide and improve discovery, recommendations, social features, and your profile.',
                        'Show public activity you choose to share (reviews, posts, lists) to other users.',
                        'Secure accounts, prevent abuse, and enforce our Terms.',
                        'Understand product usage and fix performance issues.',
                        'Respond to support requests and send important service notices.',
                    ]}
                />
            </section>
            <section>
                <H>4. Social &amp; public content</H>
                <P>
                    Content you publish (reviews, posts, public collections, public profile fields) may be
                    visible to other users and, for public pages, to anyone with the link. Private lists and
                    private settings stay limited to you and systems needed to operate the Service. Think
                    carefully before posting personal information in public areas.
                </P>
            </section>
            <section>
                <H>5. Third-party services</H>
                <P>We use trusted providers to run the Service, including:</P>
                <Ul
                    items={[
                        'Supabase — authentication and database hosting.',
                        'Vercel — application hosting and edge delivery.',
                        'TMDB — movie/TV metadata and images (subject to TMDB’s terms; we do not sell your personal data to TMDB).',
                        'Cloudinary or similar — image hosting where used.',
                        'Google Analytics — aggregated traffic analytics when enabled.',
                    ]}
                />
                <P>
                    These providers process data under their own policies. We do not sell your personal
                    information.
                </P>
            </section>
            <section>
                <H>6. Cookies &amp; similar tech</H>
                <P>
                    We use cookies and local storage for login sessions, preferences (e.g. recent searches),
                    and analytics. You can control cookies through your browser; disabling some may limit
                    features like staying signed in.
                </P>
            </section>
            <section>
                <H>7. Data retention</H>
                <P>
                    We keep account and activity data while your account is active and as needed for the
                    Service, legal obligations, and dispute resolution. You may request deletion of your
                    account; some residual logs may remain for a limited period for security and compliance.
                </P>
            </section>
            <section>
                <H>8. Children</H>
                <P>
                    The Service is not directed to children under 13 (or the minimum age required in your
                    country). We do not knowingly collect personal information from children. If you believe
                    a child has provided data, contact us and we will take appropriate steps.
                </P>
            </section>
            <section>
                <H>9. Your choices</H>
                <Ul
                    items={[
                        'Update profile and privacy-related settings in the app.',
                        'Make collections or certain content private where the product allows.',
                        'Request access, correction, or deletion by emailing us.',
                        'Stop using the Service and request account closure.',
                    ]}
                />
            </section>
            <section>
                <H>10. Security</H>
                <P>
                    We use industry-standard measures (encryption in transit, access controls) to protect
                    data. No method of transmission or storage is 100% secure; please use a strong password
                    and keep it confidential.
                </P>
            </section>
            <section>
                <H>11. International users</H>
                <P>
                    The Service may be hosted in regions different from where you live. By using it, you
                    understand your information may be processed in those locations with appropriate
                    safeguards where required.
                </P>
            </section>
            <section>
                <H>12. Changes</H>
                <P>
                    We may update this policy from time to time. The &quot;Last updated&quot; date will change
                    when we do. Continued use after changes means you accept the revised policy.
                </P>
            </section>
            <section>
                <H>13. Contact</H>
                <P>
                    Privacy requests:{' '}
                    <a href={`mailto:${CONTACT}`} className="text-white/90 underline underline-offset-2 hover:text-white">
                        {CONTACT}
                    </a>
                </P>
            </section>
        </Shell>
    );
}

export function TermsPage() {
    return (
        <Shell
            title="Terms of Service"
            description="Terms and conditions for using Theater or Stream’s movie discovery and social features."
        >
            <section>
                <H>1. Agreement</H>
                <P>
                    By accessing or using Theater or Stream ({SITE}), you agree to these Terms of Service
                    and our{' '}
                    <Link to="/privacy" className="text-white/90 underline underline-offset-2 hover:text-white">
                        Privacy Policy
                    </Link>
                    . If you do not agree, do not use the Service.
                </P>
            </section>
            <section>
                <H>2. The Service</H>
                <P>
                    Theater or Stream provides movie and TV discovery, ratings, recommendations, watchlists,
                    diaries, collections, blogs, and social features (follows, posts, reviews, feeds).
                    Features may change, and we may add or remove functionality at any time.
                </P>
            </section>
            <section>
                <H>3. Accounts</H>
                <Ul
                    items={[
                        'You must provide accurate information and keep your credentials secure.',
                        'You are responsible for activity under your account.',
                        'One person should not create accounts to evade bans or manipulate ratings/social metrics.',
                        'We may suspend or terminate accounts that violate these Terms or harm the community.',
                    ]}
                />
            </section>
            <section>
                <H>4. User content</H>
                <P>
                    You retain ownership of content you create (reviews, posts, comments, blogs, list text,
                    etc.). By posting, you grant us a worldwide, non-exclusive, royalty-free license to host,
                    display, distribute, and promote that content in connection with the Service.
                </P>
                <P>You agree not to post content that:</P>
                <Ul
                    items={[
                        'Is illegal, harassing, hateful, or threatens violence.',
                        'Infringes copyrights, trademarks, or others’ privacy/publicity rights.',
                        'Is spam, malware, or deceptive (fake engagement, impersonation).',
                        'Includes others’ personal data without permission.',
                        'Sexualizes minors or otherwise violates applicable law.',
                    ]}
                />
                <P>
                    We may remove content or restrict accounts that violate these rules, without prior notice
                    when needed to protect users or the Service.
                </P>
            </section>
            <section>
                <H>5. Ratings, reviews &amp; recommendations</H>
                <P>
                    Ratings and recommendations are opinions and algorithmic suggestions — not professional
                    advice. Theater vs streaming guidance and availability info can be incomplete or change;
                    always verify showtimes and streaming rights with official sources.
                </P>
            </section>
            <section>
                <H>6. Third-party data &amp; links</H>
                <P>
                    Catalog metadata and images may come from TMDB and other sources. Theater or Stream is
                    not endorsed by TMDB, studios, or streaming platforms. External links (trailers,
                    articles, OTT sites) are provided for convenience; we are not responsible for third-party
                    sites or services.
                </P>
            </section>
            <section>
                <H>7. Intellectual property</H>
                <P>
                    The Theater or Stream name, branding, UI, and original editorial content are ours or our
                    licensors’. Movie titles, artwork, and trademarks belong to their respective owners.
                    You may not scrape, bulk-download, or misuse the Service or TMDB-derived data in ways
                    that violate these Terms or TMDB’s terms.
                </P>
            </section>
            <section>
                <H>8. Acceptable use</H>
                <Ul
                    items={[
                        'Do not attempt to break, overload, or reverse-engineer the Service.',
                        'Do not use bots to mass-create accounts, ratings, or follows.',
                        'Do not use the Service for commercial spam or unauthorized advertising.',
                    ]}
                />
            </section>
            <section>
                <H>9. Disclaimers</H>
                <P>
                    THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES
                    OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
                    PURPOSE, AND NON-INFRINGEMENT. We do not guarantee uninterrupted or error-free operation,
                    or that recommendations will match your taste.
                </P>
            </section>
            <section>
                <H>10. Limitation of liability</H>
                <P>
                    To the fullest extent permitted by law, Theater or Stream and its operators will not be
                    liable for indirect, incidental, special, consequential, or punitive damages, or any loss
                    of data, profits, or goodwill arising from your use of the Service.
                </P>
            </section>
            <section>
                <H>11. Indemnity</H>
                <P>
                    You agree to indemnify and hold us harmless from claims arising out of your content, your
                    use of the Service, or your violation of these Terms or others’ rights.
                </P>
            </section>
            <section>
                <H>12. Termination</H>
                <P>
                    You may stop using the Service at any time. We may suspend or end access if you breach
                    these Terms. Provisions that should survive (IP, disclaimers, liability limits) will survive
                    termination.
                </P>
            </section>
            <section>
                <H>13. Changes</H>
                <P>
                    We may update these Terms. Material changes will be reflected by the &quot;Last updated&quot;
                    date. Continued use after changes constitutes acceptance.
                </P>
            </section>
            <section>
                <H>14. Contact</H>
                <P>
                    <a href={`mailto:${CONTACT}`} className="text-white/90 underline underline-offset-2 hover:text-white">
                        {CONTACT}
                    </a>
                </P>
            </section>
        </Shell>
    );
}

export function AttributionsPage() {
    return (
        <Shell
            title="Attributions & acknowledgements"
            description="TMDB API acknowledgement and third-party credits for Theater or Stream."
        >
            <section>
                <H>The Movie Database (TMDB)</H>
                <P>
                    This product uses the TMDB API but is not endorsed or certified by TMDB.
                </P>
                <div className="my-6 flex flex-col sm:flex-row sm:items-center gap-5 p-5 rounded-2xl bg-white/[0.03] border border-white/10">
                    <a
                        href="https://www.themoviedb.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                        aria-label="The Movie Database"
                    >
                        <img
                            src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
                            alt="The Movie Database (TMDB)"
                            className="h-4 w-auto opacity-90"
                        />
                    </a>
                    <p className="text-sm text-white/55 m-0">
                        Movie and TV data, posters, backdrops, cast &amp; crew, and related metadata are
                        provided by{' '}
                        <a
                            href="https://www.themoviedb.org/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/90 underline underline-offset-2 hover:text-white"
                        >
                            TMDB
                        </a>
                        . Please support their work and review{' '}
                        <a
                            href="https://www.themoviedb.org/documentation/api/terms-of-use"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/90 underline underline-offset-2 hover:text-white"
                        >
                            TMDB API Terms of Use
                        </a>
                        .
                    </p>
                </div>
                <P>
                    Theater or Stream does not claim ownership of TMDB data or studio trademarks. All title
                    names, artwork, and logos remain the property of their respective owners.
                </P>
            </section>
            <section>
                <H>Streaming &amp; availability</H>
                <P>
                    Where-to-watch information may be incomplete or outdated. Always confirm availability
                    with the official platform or theater. We are not affiliated with Netflix, Prime Video,
                    Disney+, or other services unless explicitly stated.
                </P>
            </section>
            <section>
                <H>Other notices</H>
                <Ul
                    items={[
                        'User reviews and ratings are opinions of community members, not of studios or TMDB.',
                        'Open-source libraries used in the product retain their respective licenses.',
                        'Brand marks appearing in the app belong to their owners and are used for identification only.',
                    ]}
                />
            </section>
            <section>
                <H>Questions</H>
                <P>
                    <a href={`mailto:${CONTACT}`} className="text-white/90 underline underline-offset-2 hover:text-white">
                        {CONTACT}
                    </a>
                </P>
            </section>
        </Shell>
    );
}
