import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Globe,
  Heart,
  MessageCircle,
  Newspaper,
  Send,
  Share2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { UserPublicProfile } from '../types/crm';
import {
  formatRelativeNewsTime,
  type GoogleNewsArticle,
  type NewsCommentRecord,
  type NewsLikeRecord,
} from '../utils/newsUtils';

interface GoogleNewsInstaCardProps {
  article: GoogleNewsArticle;
  likes: NewsLikeRecord[];
  comments: NewsCommentRecord[];
  sharesCount: number;
  currentUserId: string;
  currentUserName: string;
  employees: UserPublicProfile[];
  onToggleLike: (article: GoogleNewsArticle) => Promise<void>;
  onAddComment: (article: GoogleNewsArticle, text: string) => Promise<void>;
  onDeleteComment: (comment: NewsCommentRecord) => Promise<void>;
  onShareWithinOrg: (
    article: GoogleNewsArticle,
    options: {
      note: string;
      shareToFeed: boolean;
      shareToMessages: boolean;
      recipientId: string;
    }
  ) => Promise<void>;
}

const TOPIC_VISUAL_PALETTES: Record<
  GoogleNewsArticle['topic'],
  { gradient: string; badge: string; accent: string }
> = {
  top: {
    gradient:
      'linear-gradient(135deg, rgba(14, 165, 233, 0.28) 0%, rgba(99, 102, 241, 0.24) 48%, rgba(236, 72, 153, 0.22) 100%)',
    badge: 'Top Stories',
    accent: '#38bdf8',
  },
  business: {
    gradient:
      'linear-gradient(135deg, rgba(16, 185, 129, 0.26) 0%, rgba(14, 165, 233, 0.22) 52%, rgba(245, 158, 11, 0.22) 100%)',
    badge: 'Business',
    accent: '#34d399',
  },
  technology: {
    gradient:
      'linear-gradient(135deg, rgba(56, 189, 248, 0.28) 0%, rgba(139, 92, 246, 0.26) 54%, rgba(45, 212, 191, 0.24) 100%)',
    badge: 'Technology',
    accent: '#818cf8',
  },
  world: {
    gradient:
      'linear-gradient(135deg, rgba(59, 130, 246, 0.26) 0%, rgba(168, 85, 247, 0.24) 50%, rgba(244, 63, 94, 0.20) 100%)',
    badge: 'World',
    accent: '#60a5fa',
  },
  science: {
    gradient:
      'linear-gradient(135deg, rgba(20, 184, 166, 0.28) 0%, rgba(56, 189, 248, 0.22) 50%, rgba(168, 85, 247, 0.24) 100%)',
    badge: 'Science',
    accent: '#2dd4bf',
  },
};

export const GoogleNewsInstaCard: React.FC<GoogleNewsInstaCardProps> = ({
  article,
  likes,
  comments,
  sharesCount,
  currentUserId,
  currentUserName,
  employees,
  onToggleLike,
  onAddComment,
  onDeleteComment,
  onShareWithinOrg,
}) => {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Share within Organization modal state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [shareToFeed, setShareToFeed] = useState(true);
  const [shareToMessages, setShareToMessages] = useState(true);
  const [recipientId, setRecipientId] = useState('org');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareSuccess, setShareSuccess] = useState('');
  const [shareError, setShareError] = useState('');

  const commentInputRef = useRef<HTMLInputElement>(null);

  const isLiked = likes.some((l) => l.ownerId === currentUserId);
  const palette = TOPIC_VISUAL_PALETTES[article.topic] || TOPIC_VISUAL_PALETTES.top;
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(article.sourceDomain)}&sz=64`;
  const relativeTime = formatRelativeNewsTime(article.publishedAt);
  const exactTime = new Date(article.publishedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  useEffect(() => {
    if (!shareOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shareOpen]);

  const handleDoubleTapLike = async () => {
    setHeartBurst(true);
    setTimeout(() => setHeartBurst(false), 620);
    if (!isLiked) {
      await onToggleLike(article);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed) return;
    setCommentSubmitting(true);
    try {
      await onAddComment(article, trimmed);
      setCommentText('');
      setShowAllComments(true);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareToFeed && !shareToMessages) {
      setShareError('Select at least one organization destination (Home Feed or Team Messages).');
      return;
    }
    setShareBusy(true);
    setShareError('');
    try {
      await onShareWithinOrg(article, {
        note: shareNote.trim(),
        shareToFeed,
        shareToMessages,
        recipientId,
      });
      const dests: string[] = [];
      if (shareToFeed) dests.push('Organization Home Feed');
      if (shareToMessages) {
        const targetEmp = employees.find((emp) => emp.uid === recipientId);
        dests.push(recipientId === 'org' ? '#org-general' : targetEmp?.displayName || 'Team Messages');
      }
      setShareSuccess(`Shared to ${dests.join(' & ')}`);
      setShareNote('');
      setTimeout(() => {
        setShareOpen(false);
        setShareSuccess('');
      }, 900);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Unable to share this news story.');
    } finally {
      setShareBusy(false);
    }
  };

  const visibleComments = showAllComments ? comments : comments.slice(-2);

  return (
    <>
      <article
        className="liquid-surface overflow-hidden rounded-2xl"
        aria-label={`Google News post from ${article.source}: ${article.title}`}
      >
        {/* 1. Instagram Post Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3 min-w-0">
            {/* Polychromatic Story-Ring Publisher Avatar */}
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-[2px]"
              style={{
                background:
                  'linear-gradient(135deg, #38bdf8 0%, #818cf8 45%, #f472b6 80%, #fbbf24 100%)',
              }}
            >
              <div
                className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--bg-canvas)' }}
              >
                {!faviconFailed ? (
                  <img
                    src={faviconUrl}
                    alt={`${article.source} icon`}
                    className="h-5 w-5 object-contain"
                    onError={() => setFaviconFailed(true)}
                  />
                ) : (
                  <span
                    className="text-xs font-bold"
                    style={{ color: 'var(--accent)' }}
                  >
                    {article.source.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{article.source}</span>
                <span
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono-tabular uppercase tracking-wide"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    color: 'var(--accent)',
                  }}
                >
                  Google News
                </span>
              </div>
              <div
                className="flex flex-wrap items-center gap-x-2 text-xs font-mono-tabular"
                style={{ color: 'var(--text-muted)' }}
              >
                <span className="truncate">{article.sourceDomain}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={article.publishedAt} title={exactTime}>
                  {relativeTime} ({exactTime})
                </time>
              </div>
            </div>
          </div>

          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Read full story from ${article.source}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-85"
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Read</span>
          </a>
        </div>

        {/* 2. Instagram Visual Editorial Media Frame (double-click to like) */}
        <div
          onDoubleClick={handleDoubleTapLike}
          className="relative select-none overflow-hidden border-y"
          style={{ borderColor: 'var(--border-subtle)' }}
          title="Double-click to like"
        >
          {article.imageUrl && !heroImgFailed ? (
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-950/60">
              <img
                src={article.imageUrl}
                alt={article.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
                onError={() => setHeroImgFailed(true)}
              />
              {/* Top Corner Metadata Pills (keeps photo subject unobstructed) */}
              <div className="pointer-events-none absolute top-3.5 left-4 right-4 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-mono-tabular font-semibold uppercase tracking-wider text-sky-200 backdrop-blur-sm">
                  <Newspaper className="h-3 w-3" />
                  {palette.badge}
                </span>
                <span className="rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-mono-tabular text-white/90 backdrop-blur-sm">
                  {relativeTime}
                </span>
              </div>
              {/* Clean Bottom Scrim for Editorial Headline */}
              <div
                className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-4 pt-12 pb-4 sm:px-6 sm:pb-5"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(4,9,20,0) 0%, rgba(4,9,20,0.62) 48%, rgba(4,9,20,0.92) 100%)',
                }}
              >
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <h3 className="font-display text-lg sm:text-2xl font-extrabold leading-snug text-white drop-shadow-sm transition-opacity group-hover:opacity-90">
                    {article.title}
                  </h3>
                </a>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-white/80">
                  <span className="font-medium">{article.source}</span>
                  {article.relatedCoverage.length > 0 && (
                    <span className="font-mono-tabular">
                      +{article.relatedCoverage.length} related sources
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="relative flex min-h-[220px] sm:min-h-[250px] flex-col justify-between p-5 sm:p-7"
              style={{ backgroundImage: palette.gradient }}
            >
              {/* Subtle Blueprint Grid Overlay inside Instagram Media Card */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'linear-gradient(var(--vector-grid-fine) 1px, transparent 1px), linear-gradient(90deg, var(--vector-grid-fine) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }}
              />

              <div className="relative flex items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono-tabular font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Globe className="h-3 w-3" style={{ color: palette.accent }} />
                  {palette.badge} · LIVE WIRE
                </span>
                <span
                  className="rounded-lg px-2.5 py-1 text-[11px] font-mono-tabular"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {relativeTime}
                </span>
              </div>

              <div className="relative my-4">
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <h3
                    className="font-display text-xl sm:text-2xl font-extrabold leading-snug tracking-tight transition-opacity group-hover:opacity-85"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {article.title}
                  </h3>
                </a>
              </div>

              <div className="relative flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Published by {article.source}
                </span>
                {article.relatedCoverage.length > 0 && (
                  <span className="font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                    +{article.relatedCoverage.length} related sources
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Double-Tap Heart Pop Overlay */}
          {heartBurst && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <Heart className="h-20 w-20 animate-ping fill-rose-500 text-rose-500 drop-shadow-2xl" />
            </div>
          )}
        </div>

        {/* 3. Instagram Action Bar (Like, Comment, Share within Org, Open Link) */}
        <div className="px-4 pt-3.5 pb-4 sm:px-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => void onToggleLike(article)}
                aria-pressed={isLiked}
                aria-label={isLiked ? `Unlike news post: ${article.title}` : `Like news post: ${article.title}`}
                className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-transform active:scale-95 hover:bg-white/10"
                style={{ color: isLiked ? '#f43f5e' : 'var(--text-primary)' }}
              >
                <Heart className={`h-5 w-5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                <span className="font-mono-tabular">{likes.length}</span>
                <span className="hidden sm:inline">{isLiked ? 'Liked' : 'Like'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAllComments(true);
                  setTimeout(() => commentInputRef.current?.focus(), 30);
                }}
                aria-label={`Comment on news post: ${article.title}`}
                className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
                style={{ color: 'var(--text-primary)' }}
              >
                <MessageCircle className="h-5 w-5" />
                <span className="font-mono-tabular">{comments.length}</span>
                <span className="hidden sm:inline">Comment</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShareError('');
                  setShareSuccess('');
                  setShareOpen(true);
                }}
                aria-label={`Share news post within organization: ${article.title}`}
                className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
                style={{ color: 'var(--text-primary)' }}
              >
                <Send className="h-4 w-4" />
                {sharesCount > 0 && <span className="font-mono-tabular">{sharesCount}</span>}
                <span>Share in Org</span>
              </button>
            </div>

            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Open Google News →
            </a>
          </div>

          {/* Likes & Caption Summary */}
          <div className="space-y-1.5 text-sm">
            {likes.length > 0 && (
              <div className="text-xs font-semibold font-mono-tabular" style={{ color: 'var(--text-primary)' }}>
                {likes.length === 1
                  ? `Liked by ${likes[0].authorName}`
                  : `Liked by ${likes[0].authorName} and ${likes.length - 1} other${likes.length - 1 === 1 ? '' : 's'}`}
              </div>
            )}

            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              <span className="mr-2 font-semibold">{article.source}</span>
              <span>{article.title}</span>
            </p>

            {/* Related Multi-Source Coverage */}
            {article.relatedCoverage.length > 0 && (
              <div className="pt-1 space-y-1">
                <div className="text-[11px] font-mono-tabular uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Related coverage
                </div>
                <div className="flex flex-wrap gap-2">
                  {article.relatedCoverage.map((rel, idx) => (
                    <a
                      key={`${article.id}_rel_${idx}`}
                      href={rel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-opacity hover:opacity-85"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                        {rel.source}
                      </span>
                      <span className="max-w-[240px] truncate">{rel.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Instagram-Style Comments List */}
          {comments.length > 2 && !showAllComments && (
            <button
              type="button"
              onClick={() => setShowAllComments(true)}
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              View all {comments.length} comments
            </button>
          )}

          {visibleComments.length > 0 && (
            <div className="space-y-2 pt-1">
              {visibleComments.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded-xl px-3 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="min-w-0 leading-relaxed">
                    <span className="mr-1.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {c.authorName}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{c.text}</span>
                    <span className="ml-2 font-mono-tabular text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {formatRelativeNewsTime(c.createdAt)}
                    </span>
                  </div>
                  {c.ownerId === currentUserId && (
                    <button
                      type="button"
                      onClick={() => void onDeleteComment(c)}
                      aria-label={`Delete comment by ${c.authorName}`}
                      className="shrink-0 rounded p-1 transition-colors hover:bg-red-500/15 hover:text-red-500"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 5. Inline Instagram Comment Composer */}
          <form
            onSubmit={handleCommentSubmit}
            className="flex items-center gap-2 pt-2"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <label htmlFor={`news-comment-${article.id}`} className="sr-only">
              Add a comment on {article.title}
            </label>
            <input
              id={`news-comment-${article.id}`}
              ref={commentInputRef}
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={1000}
              placeholder={`Add a comment as ${currentUserName}...`}
              className="flex-1 rounded-xl px-3.5 py-2 text-xs outline-none focus-visible:ring-2"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="submit"
              disabled={commentSubmitting || !commentText.trim()}
              className="rounded-xl px-3.5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
            >
              {commentSubmitting ? 'Posting...' : 'Post'}
            </button>
          </form>
        </div>
      </article>

      {/* Share Within Organization Modal (60% transparent · 10% blur polychromatic overlay) */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Share Google News within Organization"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareOpen(false);
          }}
        >
          <div className="liquid-elevated w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Share2 className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                  Share Within Organization
                </h2>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Broadcast this live Google News story to your organization feed or team chat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                aria-label="Close share dialog"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-opacity hover:opacity-80"
                style={{ color: 'var(--text-primary)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Article Preview */}
            <div
              className="rounded-xl p-3.5 space-y-1"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="text-[11px] font-mono-tabular uppercase" style={{ color: 'var(--accent)' }}>
                {article.source} · {relativeTime}
              </div>
              <div className="text-sm font-semibold leading-snug">{article.title}</div>
            </div>

            <form onSubmit={handleShareSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor={`share-note-${article.id}`}
                  className="mb-1.5 block text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Add Organization Note (Optional)
                </label>
                <textarea
                  id={`share-note-${article.id}`}
                  rows={2}
                  maxLength={500}
                  value={shareNote}
                  onChange={(e) => setShareNote(e.target.value)}
                  placeholder="Why does this matter to our team, pipeline, or customers?"
                  className="w-full resize-none rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="space-y-2.5">
                <span className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Organization Destinations
                </span>

                <label
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={shareToFeed}
                    onChange={(e) => setShareToFeed(e.target.checked)}
                    className="h-4 w-4 accent-sky-500"
                  />
                  <span className="font-medium">Organization Home Feed</span>
                </label>

                <div
                  className="space-y-2.5 rounded-xl px-3.5 py-2.5"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={shareToMessages}
                      onChange={(e) => setShareToMessages(e.target.checked)}
                      className="h-4 w-4 accent-sky-500"
                    />
                    <Users className="h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} />
                    <span className="font-medium">Team Messages</span>
                  </label>

                  {shareToMessages && (
                    <div className="pl-7">
                      <label htmlFor={`share-recipient-${article.id}`} className="sr-only">
                        Select team channel or colleague
                      </label>
                      <select
                        id={`share-recipient-${article.id}`}
                        value={recipientId}
                        onChange={(e) => setRecipientId(e.target.value)}
                        className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value="org">#org-general — Entire Organization</option>
                        {employees
                          .filter((emp) => emp.uid !== currentUserId)
                          .map((emp) => (
                            <option key={emp.uid} value={emp.uid}>
                              Direct Message — {emp.displayName}
                              {emp.roleTitle ? ` (${emp.roleTitle})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {shareError && <p className="text-xs text-red-500">{shareError}</p>}
              {shareSuccess && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3.5 py-2.5 text-xs font-medium text-emerald-400">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{shareSuccess}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={shareBusy}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                >
                  <Send className="h-3.5 w-3.5" />
                  {shareBusy ? 'Sharing...' : 'Share with Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
