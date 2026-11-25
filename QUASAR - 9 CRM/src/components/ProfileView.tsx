import React, { useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Grid3X3,
  Heart,
  ImagePlus,
  LayoutDashboard,
  Save,
  X,
} from 'lucide-react';
import type {
  AiDashboardReport,
  FeedPost,
  TaskItem,
  UserPublicProfile,
} from '../types/crm';
import { compressImageFile } from '../lib/firebase';
import { formatTimestamp } from '../utils/crmLogic';
import { GoogleSignInButton } from './GoogleSignInButton';

interface ProfileViewProps {
  currentUserId: string | null;
  profile: UserPublicProfile | null;
  userEmail: string;
  posts: FeedPost[];
  tasks: TaskItem[];
  dashboards: AiDashboardReport[];
  onUpdateProfile: (updates: {
    displayName: string;
    roleTitle: string;
    department: string;
    bio: string;
    photoUrl: string;
  }) => Promise<void>;
  onCreatePost: (caption: string, imageUrl: string) => Promise<void>;
  onSignIn: () => Promise<void>;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUserId,
  profile,
  userEmail,
  posts,
  tasks,
  dashboards,
  onUpdateProfile,
  onCreatePost,
  onSignIn,
}) => {
  const [activeTab, setActiveTab] = useState<'posts' | 'milestones' | 'reports'>('posts');
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [roleTitle, setRoleTitle] = useState(profile?.roleTitle || '');
  const [department, setDepartment] = useState(profile?.department || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [photoUrl, setPhotoUrl] = useState(profile?.photoUrl || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');

  // Upload New Instagram Post modal state
  const [showPostModal, setShowPostModal] = useState(false);
  const [postCaption, setPostCaption] = useState('');
  const [postImage, setPostImage] = useState('');
  const [posting, setPosting] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const postFileRef = useRef<HTMLInputElement>(null);

  const myUid = currentUserId || 'local-session';
  const myPosts = posts.filter((p) => p.ownerId === myUid);
  const myCompletedTasks = tasks.filter((t) => t.status === 'completed');

  const startEditing = () => {
    setDisplayName(profile?.displayName || '');
    setRoleTitle(profile?.roleTitle || '');
    setDepartment(profile?.department || '');
    setBio(profile?.bio || '');
    setPhotoUrl(profile?.photoUrl || '');
    setEditing(true);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 360, 0.78);
      setPhotoUrl(compressed);
      if (!editing) {
        await onUpdateProfile({
          displayName: profile?.displayName || 'Workspace Member',
          roleTitle: profile?.roleTitle || '',
          department: profile?.department || '',
          bio: profile?.bio || '',
          photoUrl: compressed,
        });
        setProfileNotice('Profile picture updated.');
        setTimeout(() => setProfileNotice(''), 2500);
      }
    } catch {
      setProfileNotice('Could not read that image file.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSavingProfile(true);
    try {
      await onUpdateProfile({
        displayName: displayName.trim(),
        roleTitle: roleTitle.trim(),
        department: department.trim(),
        bio: bio.trim(),
        photoUrl,
      });
      setEditing(false);
      setProfileNotice('Profile saved.');
      setTimeout(() => setProfileNotice(''), 2500);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePostFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageFile(file, 720, 0.72);
    setPostImage(compressed);
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postCaption.trim()) return;
    setPosting(true);
    try {
      await onCreatePost(postCaption.trim(), postImage);
      setPostCaption('');
      setPostImage('');
      setShowPostModal(false);
      if (postFileRef.current) postFileRef.current.value = '';
    } finally {
      setPosting(false);
    }
  };

  const currentAvatar = editing ? photoUrl : profile?.photoUrl || '';
  const shownName = profile?.displayName || 'Your Employee Profile';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Instagram-style Profile Header */}
      <section className="liquid-surface rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          {/* Circular Uploadable Avatar */}
          <div className="relative shrink-0">
            <div
              className="h-24 w-24 overflow-hidden rounded-full sm:h-28 sm:w-28"
              style={{ border: '2px solid var(--glass-active-border)' }}
            >
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt={shownName}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-3xl font-bold"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  {shownName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
              id="profile-avatar-upload"
            />
            <label
              htmlFor="profile-avatar-upload"
              title="Upload profile picture"
              className="absolute right-0 bottom-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
            >
              <Camera className="h-4 w-4" />
              <span className="sr-only">Upload profile picture</span>
            </label>
          </div>

          {/* Info & Stats */}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">{shownName}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPostModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Upload Post
                </button>
                <button
                  type="button"
                  onClick={editing ? () => setEditing(false) : startEditing}
                  className="rounded-xl px-3.5 py-2 text-xs font-medium liquid-surface whitespace-nowrap hover:opacity-90"
                >
                  {editing ? 'Cancel Edit' : 'Edit Profile'}
                </button>
                {!currentUserId && <GoogleSignInButton onClick={onSignIn} label="Sign in with Google" />}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-sm font-mono-tabular">
              <span><strong>{myPosts.length}</strong> posts</span>
              <span><strong>{myCompletedTasks.length}</strong> completed tasks</span>
              <span><strong>{dashboards.length}</strong> AI reports</span>
            </div>

            <div className="space-y-1 text-sm">
              <div className="font-medium">
                {profile?.roleTitle || 'Add your role'}{profile?.department ? ` · ${profile.department}` : ''}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {profile?.bio || 'Add a short bio about your focus area, accounts, or quarterly objectives.'}
              </p>
              {userEmail && (
                <div className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                  {userEmail}
                </div>
              )}
            </div>

            {profileNotice && (
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-500">
                <Check className="h-3.5 w-3.5" />
                {profileNotice}
              </div>
            )}
          </div>
        </div>

        {/* Inline Edit Profile Form */}
        {editing && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-6 grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <div>
              <label htmlFor="prof-name" className="mb-1 block text-xs font-medium">Display Name</label>
              <input
                id="prof-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <div>
              <label htmlFor="prof-role" className="mb-1 block text-xs font-medium">Role / Title</label>
              <input
                id="prof-role"
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g., Account Executive"
                className="w-full rounded-xl px-3.5 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <div>
              <label htmlFor="prof-dept" className="mb-1 block text-xs font-medium">Department</label>
              <input
                id="prof-dept"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g., Enterprise Revenue"
                className="w-full rounded-xl px-3.5 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <div>
              <label htmlFor="prof-bio" className="mb-1 block text-xs font-medium">Bio</label>
              <input
                id="prof-bio"
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Short bio..."
                className="w-full rounded-xl px-3.5 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                <Save className="h-3.5 w-3.5" />
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Instagram Profile Section Tabs (80% transparent liquid glass active) */}
      <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Profile sections">
        {(
          [
            { id: 'posts', label: 'Posts Grid', icon: Grid3X3 },
            { id: 'milestones', label: 'Completed Tasks', icon: CheckCircle2 },
            { id: 'reports', label: 'Saved AI Reports', icon: LayoutDashboard },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium whitespace-nowrap ${
                active ? 'liquid-glass-active' : 'liquid-surface hover:opacity-90'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Instagram 3-Column Posts Grid */}
      {activeTab === 'posts' && (
        myPosts.length === 0 ? (
          <div className="liquid-surface rounded-2xl p-12 text-center">
            <ImagePlus className="mx-auto mb-3 h-9 w-9" style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-base font-semibold">No posts uploaded yet</h2>
            <p className="mx-auto mt-1 max-w-md text-xs" style={{ color: 'var(--text-secondary)' }}>
              Upload a photo post or complete a task to populate your Instagram-style portfolio grid.
            </p>
            <button
              type="button"
              onClick={() => setShowPostModal(true)}
              className="mt-4 rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
            >
              Upload First Post
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {myPosts.map((post) => (
              <div key={post.id} className="liquid-surface group overflow-hidden rounded-2xl flex flex-col">
                {post.imageUrl ? (
                  <div className="aspect-square w-full overflow-hidden">
                    <img
                      src={post.imageUrl}
                      alt={post.caption.slice(0, 80)}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-103"
                    />
                  </div>
                ) : (
                  <div
                    className="flex aspect-square w-full flex-col justify-between p-5"
                    style={{ backgroundColor: 'var(--bg-input)' }}
                  >
                    <span className="text-xs font-mono-tabular" style={{ color: 'var(--accent)' }}>
                      {post.postType === 'task_completion' ? 'Task Completed' : 'Update'}
                    </span>
                    <p className="line-clamp-5 text-sm font-medium leading-relaxed">{post.caption}</p>
                    <span className="text-[11px] font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                      {formatTimestamp(post.createdAt)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs">
                  <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{post.caption}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                    <Heart className="h-3.5 w-3.5" />
                    {post.likesCount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab 2: Completed Tasks */}
      {activeTab === 'milestones' && (
        <div className="liquid-surface rounded-2xl divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {myCompletedTasks.length === 0 ? (
            <div className="p-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              No completed tasks yet.
            </div>
          ) : (
            myCompletedTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <div className="text-sm font-semibold">{t.title}</div>
                  {t.description && <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.description}</div>}
                </div>
                <span className="text-xs font-mono-tabular text-emerald-500">
                  {formatTimestamp(t.updatedAt)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Saved AI Reports */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {dashboards.length === 0 ? (
            <div className="liquid-surface rounded-2xl p-10 text-center text-xs sm:col-span-2" style={{ color: 'var(--text-muted)' }}>
              No saved AI dashboards yet.
            </div>
          ) : (
            dashboards.map((d) => (
              <div key={d.id} className="liquid-surface rounded-2xl p-5 space-y-2">
                <div className="text-sm font-semibold">{d.title}</div>
                <p className="line-clamp-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{d.summary}</p>
                <div className="text-[11px] font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                  {formatTimestamp(d.createdAt)} · {d.charts.length} charts
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Upload Post Modal */}
      {showPostModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Upload new profile post"
        >
          <form onSubmit={handlePublishPost} className="liquid-elevated w-full max-w-lg rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Upload New Post</h2>
              <button
                type="button"
                onClick={() => setShowPostModal(false)}
                aria-label="Close upload modal"
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              ref={postFileRef}
              type="file"
              accept="image/*"
              onChange={handlePostFilePick}
              className="hidden"
              id="profile-post-image"
            />
            <label
              htmlFor="profile-post-image"
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border-strong)' }}
            >
              {postImage ? (
                <img src={postImage} alt="Upload preview" className="max-h-56 rounded-lg object-cover" />
              ) : (
                <>
                  <ImagePlus className="mb-2 h-7 w-7" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-xs font-medium">Choose a photo to upload (optional)</span>
                </>
              )}
            </label>

            <textarea
              rows={3}
              required
              value={postCaption}
              onChange={(e) => setPostCaption(e.target.value)}
              placeholder="Write a caption for your post..."
              className="w-full rounded-xl p-3.5 text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPostModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-medium liquid-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={posting}
                className="rounded-xl px-5 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                {posting ? 'Publishing...' : 'Publish Post'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
