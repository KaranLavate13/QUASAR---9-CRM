import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Heart,
  ImagePlus,
  Newspaper,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { FeedPost, TaskItem, UserPublicProfile } from '../types/crm';
import { formatTimestamp } from '../utils/crmLogic';
import { compressImageFile } from '../lib/firebase';
import {
  GOOGLE_NEWS_TOPICS,
  type GoogleNewsArticle,
  type NewsCommentRecord,
  type NewsLikeRecord,
  type NewsTopicId,
} from '../utils/newsUtils';
import { GoogleNewsInstaCard } from './GoogleNewsInstaCard';

interface HomeFeedViewProps {
  posts: FeedPost[];
  tasks: TaskItem[];
  employees: UserPublicProfile[];
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto: string;
  newsLikes: NewsLikeRecord[];
  newsComments: NewsCommentRecord[];
  newsShareCounts: Record<string, number>;
  onCreatePost: (caption: string, imageUrl: string) => Promise<void>;
  onLikePost: (post: FeedPost) => Promise<void>;
  onDeletePost: (post: FeedPost) => Promise<void>;
  onToggleNewsLike: (article: GoogleNewsArticle) => Promise<void>;
  onAddNewsComment: (article: GoogleNewsArticle, text: string) => Promise<void>;
  onDeleteNewsComment: (comment: NewsCommentRecord) => Promise<void>;
  onShareNewsWithinOrg: (
    article: GoogleNewsArticle,
    options: {
      note: string;
      shareToFeed: boolean;
      shareToMessages: boolean;
      recipientId: string;
    }
  ) => Promise<void>;
  onGoToTasks: () => void;
}

type FeedFilter = 'all' | 'google_news' | 'task_completion' | 'photo_post';

type UnifiedTimelineItem =
  | { kind: 'org_post'; id: string; timestamp: string; post: FeedPost }
  | { kind: 'google_news'; id: string; timestamp: string; article: GoogleNewsArticle };

function groupTimelineByDay(
  items: UnifiedTimelineItem[]
): Array<{ dayKey: string; label: string; items: UnifiedTimelineItem[] }> {
  const sorted = [...items].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const map = new Map<string, UnifiedTimelineItem[]>();
  for (const item of sorted) {
    const dt = new Date(item.timestamp);
    const key = Number.isNaN(dt.getTime()) ? 'today' : dt.toISOString().slice(0, 10);
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  return Array.from(map.entries()).map(([dayKey, bucket]) => {
    let label = dayKey;
    if (dayKey === todayKey) {
      label = 'Today';
    } else if (dayKey === yesterdayKey) {
      label = 'Yesterday';
    } else {
      const parsed = new Date(`${dayKey}T12:00:00Z`);
      if (!Number.isNaN(parsed.getTime())) {
        label = parsed.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });
      }
    }
    return { dayKey, label, items: bucket };
  });
}

export const HomeFeedView: React.FC<HomeFeedViewProps> = ({
  posts,
  tasks,
  employees,
  currentUserId,
  currentUserName,
  currentUserPhoto,
  newsLikes,
  newsComments,
  newsShareCounts,
  onCreatePost,
  onLikePost,
  onDeletePost,
  onToggleNewsLike,
  onAddNewsComment,
  onDeleteNewsComment,
  onShareNewsWithinOrg,
  onGoToTasks,
}) => {
  const [filterType, setFilterType] = useState<FeedFilter>('all');
  const [caption, setCaption] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Live Google News state (always loads regardless of sign-in!)
  const [newsTopic, setNewsTopic] = useState<NewsTopicId>('top');
  const [newsArticles, setNewsArticles] = useState<GoogleNewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(6);

  const fetchGoogleNews = useCallback(async (topic: NewsTopicId, forceRefresh = false) => {
    setNewsLoading(true);
    setNewsError('');
    try {
      const qs = forceRefresh ? `&refresh=1` : '';
      const res = await fetch(`/api/news/google?topic=${encodeURIComponent(topic)}${qs}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to load latest Google News.');
      }
      setNewsArticles(Array.isArray(data.articles) ? data.articles : []);
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Unable to load latest Google News.');
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    setVisibleLimit(6);
    void fetchGoogleNews(newsTopic, false);
  }, [newsTopic, fetchGoogleNews]);

  // Index likes & comments by articleId for O(1) lookup
  const likesByArticle = useMemo(() => {
    const map = new Map<string, NewsLikeRecord[]>();
    for (const like of newsLikes) {
      const list = map.get(like.articleId) ?? [];
      list.push(like);
      map.set(like.articleId, list);
    }
    return map;
  }, [newsLikes]);

  const commentsByArticle = useMemo(() => {
    const map = new Map<string, NewsCommentRecord[]>();
    const sorted = [...newsComments].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (const c of sorted) {
      const list = map.get(c.articleId) ?? [];
      list.push(c);
      map.set(c.articleId, list);
    }
    return map;
  }, [newsComments]);

  const timelineItems = useMemo<UnifiedTimelineItem[]>(() => {
    const items: UnifiedTimelineItem[] = [];

    if (filterType === 'all' || filterType === 'task_completion' || filterType === 'photo_post') {
      const matchingPosts =
        filterType === 'all'
          ? posts
          : posts.filter((p) => p.postType === filterType);
      for (const post of matchingPosts) {
        items.push({
          kind: 'org_post',
          id: `org_${post.id}`,
          timestamp: post.createdAt,
          post,
        });
      }
    }

    if (filterType === 'all' || filterType === 'google_news') {
      for (const article of newsArticles) {
        items.push({
          kind: 'google_news',
          id: `news_${article.id}`,
          timestamp: article.publishedAt,
          article,
        });
      }
    }

    return items;
  }, [posts, newsArticles, filterType]);

  const sortedTimelineItems = useMemo(
    () =>
      [...timelineItems].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [timelineItems]
  );

  const visibleTimelineItems = useMemo(
    () => sortedTimelineItems.slice(0, visibleLimit),
    [sortedTimelineItems, visibleLimit]
  );

  const remainingItemsCount = Math.max(0, sortedTimelineItems.length - visibleTimelineItems.length);

  const grouped = useMemo(() => groupTimelineByDay(visibleTimelineItems), [visibleTimelineItems]);

  const completedTodayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return posts.filter(
      (p) => p.postType === 'task_completion' && p.createdAt.slice(0, 10) === today
    ).length;
  }, [posts]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMsg('');
      const compressed = await compressImageFile(file, 720, 0.72);
      setImagePreview(compressed);
    } catch {
      setErrorMsg('Could not process that image. Please choose a JPG, PNG, or WebP file.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim()) {
      setErrorMsg('Write a short caption before publishing to the feed.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      await onCreatePost(caption.trim(), imagePreview);
      setCaption('');
      setImagePreview('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to publish post.');
    } finally {
      setSubmitting(false);
    }
  };

  const openTasksCount = tasks.filter((t) => t.status !== 'completed').length;
  const showNewsTopicBar = filterType === 'all' || filterType === 'google_news';

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Chronological organization stream & live Google News — like, comment, and share stories across your team.
        </p>
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-tabular"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="whitespace-nowrap">{newsArticles.length} live news</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">{completedTodayCount} completed today</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">{openTasksCount} active tasks</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">{posts.length} team posts</span>
        </div>
      </div>

      {/* Filter Segmented Control (92% transparent polychromatic liquid glass when active) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Feed filter">
          {(
            [
              { id: 'all', label: 'All Activity' },
              { id: 'google_news', label: 'Google News' },
              { id: 'task_completion', label: 'Task Completions' },
              { id: 'photo_post', label: 'Team Posts' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filterType === tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`rounded-xl px-4 py-2 text-xs font-medium whitespace-nowrap transition-[transform,opacity,border-color,box-shadow] ${
                filterType === tab.id ? 'liquid-glass-active' : 'liquid-surface hover:opacity-90'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onGoToTasks}
          className="rounded-xl px-4 py-2 text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
        >
          Complete a Task
        </button>
      </div>

      {/* Live Google News Topic Bar (available regardless of sign-in state) */}
      {showNewsTopicBar && (
        <div className="liquid-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 pr-1 text-xs font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              <Newspaper className="h-4 w-4" />
              Google News Wire
            </span>
            {GOOGLE_NEWS_TOPICS.map((t) => {
              const active = newsTopic === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNewsTopic(t.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-[transform,opacity,border-color,box-shadow] ${
                    active ? 'liquid-glass-active' : 'hover:bg-white/10'
                  }`}
                  style={!active ? { color: 'var(--text-secondary)' } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void fetchGoogleNews(newsTopic, true)}
            disabled={newsLoading}
            aria-label="Refresh latest Google News"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${newsLoading ? 'animate-spin' : ''}`} />
            <span>{newsLoading ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      )}

      {/* Instagram-style Team Post Composer */}
      {filterType !== 'google_news' && (
        <form onSubmit={handleSubmit} className="liquid-surface rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3.5">
            {currentUserPhoto ? (
              <img
                src={currentUserPhoto}
                alt={currentUserName}
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                {(currentUserName || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 space-y-3">
              <label htmlFor="feed-caption" className="sr-only">
                Share a daily update or milestone
              </label>
              <textarea
                id="feed-caption"
                rows={2}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Share a shipped deliverable, customer win, or visual update..."
                className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none focus-visible:ring-2"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />

              {imagePreview && (
                <div className="relative inline-block overflow-hidden rounded-xl border border-white/15">
                  <img
                    src={imagePreview}
                    alt="Post upload preview"
                    className="max-h-60 w-auto object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImagePreview('')}
                    aria-label="Remove uploaded image"
                    className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImagePick}
                    className="hidden"
                    id="feed-photo-input"
                  />
                  <label
                    htmlFor="feed-photo-input"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-colors hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <ImagePlus className="h-4 w-4" />
                    Attach Photo
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitting ? 'Publishing...' : 'Publish Update'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* News Error Notice */}
      {showNewsTopicBar && newsError && (
        <div className="liquid-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-xs">
          <span className="text-red-400">Google News notice: {newsError}</span>
          <button
            type="button"
            onClick={() => void fetchGoogleNews(newsTopic, true)}
            className="rounded-lg px-3 py-1.5 font-semibold"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton for Initial News Fetch */}
      {showNewsTopicBar && newsLoading && newsArticles.length === 0 && grouped.length === 0 && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading latest Google News">
          {[1, 2].map((n) => (
            <div key={n} className="liquid-surface animate-pulse rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/10" />
                <div className="space-y-2 flex-1">
                  <div className="h-3.5 w-36 rounded bg-white/10" />
                  <div className="h-3 w-24 rounded bg-white/10" />
                </div>
              </div>
              <div className="h-48 w-full rounded-xl bg-white/10" />
              <div className="h-4 w-3/4 rounded bg-white/10" />
            </div>
          ))}
        </div>
      )}

      {/* Chronological Day-Grouped Feed (Unified Team Posts + Instagram-style Google News) */}
      {grouped.length === 0 && !(showNewsTopicBar && newsLoading) ? (
        <div className="liquid-surface rounded-2xl p-12 text-center">
          <Calendar className="mx-auto mb-3 h-9 w-9" style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-lg font-semibold">Your chronological feed is ready</h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
            No fictional team posts are preloaded. Complete a task in your Workspace or publish a real update above to start your organization’s daily stream.
          </p>
          <button
            type="button"
            onClick={onGoToTasks}
            className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
          >
            <CheckCircle2 className="h-4 w-4" />
            Open Tasks Workspace
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.dayKey} className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold tracking-tight">{group.label}</h2>
                <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-subtle)' }} />
                <span className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                  {group.items.length} {group.items.length === 1 ? 'post' : 'posts'}
                </span>
              </div>

              <div className="space-y-5">
                {group.items.map((item) => {
                  if (item.kind === 'google_news') {
                    return (
                      <GoogleNewsInstaCard
                        key={item.id}
                        article={item.article}
                        likes={likesByArticle.get(item.article.id) ?? []}
                        comments={commentsByArticle.get(item.article.id) ?? []}
                        sharesCount={newsShareCounts[item.article.id] || 0}
                        currentUserId={currentUserId}
                        currentUserName={currentUserName}
                        employees={employees}
                        onToggleLike={onToggleNewsLike}
                        onAddComment={onAddNewsComment}
                        onDeleteComment={onDeleteNewsComment}
                        onShareWithinOrg={onShareNewsWithinOrg}
                      />
                    );
                  }

                  const post = item.post;
                  return (
                    <article key={item.id} className="liquid-surface overflow-hidden rounded-2xl">
                      {/* Post header */}
                      <div className="flex items-center justify-between gap-3 px-5 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {post.authorPhotoUrl ? (
                            <img
                              src={post.authorPhotoUrl}
                              alt={post.authorName}
                              referrerPolicy="no-referrer"
                              className="h-9 w-9 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                              style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                            >
                              {post.authorName.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{post.authorName}</div>
                            <div
                              className="flex items-center gap-2 text-xs font-mono-tabular"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <span>
                                {post.postType === 'task_completion'
                                  ? 'Completed task'
                                  : post.postType === 'milestone'
                                    ? 'CRM milestone'
                                    : 'Org Update'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{formatTimestamp(post.createdAt)}</span>
                            </div>
                          </div>
                        </div>

                        {currentUserId && post.ownerId === currentUserId && (
                          <button
                            type="button"
                            onClick={() => onDeletePost(post)}
                            aria-label={`Delete post by ${post.authorName}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-500"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Optional Instagram-style visual image */}
                      {post.imageUrl && (
                        <div
                          className="w-full overflow-hidden border-y"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <img
                            src={post.imageUrl}
                            alt={post.caption.slice(0, 80)}
                            className="max-h-[460px] w-full object-cover"
                          />
                        </div>
                      )}

                      {/* Post body */}
                      <div className="px-5 py-4 space-y-3">
                        {post.taskTitle && (
                          <div className="flex items-center gap-2 text-sm font-medium text-emerald-500">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{post.taskTitle}</span>
                          </div>
                        )}
                        <p
                          className="whitespace-pre-line text-sm leading-relaxed"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {post.caption}
                        </p>

                        <div className="flex items-center gap-4 pt-1">
                          <button
                            type="button"
                            onClick={() => onLikePost(post)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <Heart className="h-4 w-4" />
                            <span className="font-mono-tabular">{post.likesCount}</span>
                            <span>Appreciate</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {remainingItemsCount > 0 && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 6)}
                className="liquid-surface inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-xs font-semibold transition-transform hover:scale-[1.01]"
              >
                <Newspaper className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                <span>
                  Load More Stories ({remainingItemsCount} remaining)
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
