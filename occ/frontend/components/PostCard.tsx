"use client";

import { Post, Comment } from "@/lib/dataProvider";
import { likePostOnApi, unlikePostOnApi, commentOnPostOnApi, listCommentsOnApi } from "@/lib/postApi";
import { MessageSquare, ArrowBigUp, Share2, Expand, MoreHorizontal, Edit, Trash2, Flag, X } from "lucide-react";
import { memo, useState, useCallback, useRef, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter, usePathname } from "next/navigation";
import ImageWithFallback from "@/components/ImageWithFallback";
import ModalShell from "@/components/ModalShell";

function PostCard({ post }: { post: Post }) {
  const { user, deletePost, updatePost, isLoggedIn } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [liked, setLiked] = useState<boolean>(!!post.isLiked);
  const [likesCount, setLikesCount] = useState<number>(post.likes);
  const [showComments, setShowComments] = useState<boolean>(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [localCommentsCount, setLocalCommentsCount] = useState<number>(post.commentsCount ?? 0);
  const [commentsLoaded, setCommentsLoaded] = useState<boolean>(false);
  const [newComment, setNewComment] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [editForm, setEditForm] = useState({
    content: post.content,
    image: post.image
  });
  const [reportReason, setReportReason] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const isAuthor = user?.name === post.author;
  const safeClubLogo = post.clubLogo || "/globe.svg";
  const safePostImage = post.image?.trim() || null;

  const redirectToLogin = useCallback(() => {
    const nextPath = pathname ?? "/";
    router.push(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [pathname, router]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const toggleLike = async () => {
    if (!isLoggedIn) {
      redirectToLogin();
      return;
    }
    const newLikedState = !liked;
    const newLikesCount = newLikedState ? likesCount + 1 : likesCount - 1;
    
    setLiked(newLikedState);
    setLikesCount(newLikesCount);

    updatePost({
      ...post,
      isLiked: newLikedState,
      likes: newLikesCount
    });

    try {
      if (newLikedState) {
        await likePostOnApi(post.id);
      } else {
        await unlikePostOnApi(post.id);
      }
    } catch (e) {
      console.error("Failed to toggle like", e);
      setLiked(!newLikedState);
      setLikesCount(likesCount);
      updatePost({
        ...post,
        isLiked: !newLikedState,
        likes: likesCount
      });
    }
  };

  const copyToClipboard = useCallback(async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "true");
    input.style.position = "absolute";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }, []);

  const sharePost = async () => {
    if (!isLoggedIn) {
      redirectToLogin();
      return;
    }

    const postUrl = `${window.location.origin}/post/${post.id}`;
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1600);

    try {
      if (navigator.share) {
        void navigator.share({
          title: `${post.clubName} on OCC`,
          text: post.content,
          url: postUrl,
        }).catch(() => {});
        return;
      }

      await copyToClipboard(postUrl);
    } catch {
      setShareCopied(false);
    }
  };

  const handleAddComment = useCallback(async () => {
    if (!isLoggedIn) {
      redirectToLogin();
      return;
    }
    if (!newComment.trim() || !user) return;
    
    const tempId = Date.now().toString();
    const tempComment: Comment = {
      id: tempId,
      author: user.name,
      content: newComment.trim()
    };
    
    setComments([...comments, tempComment]);
    setLocalCommentsCount(prev => prev + 1);
    setNewComment("");

    updatePost({
      ...post,
      commentsCount: localCommentsCount + 1
    });

    try {
      await commentOnPostOnApi(post.id, tempComment.content);
    } catch (e) {
      console.error("Failed to post comment", e);
      setComments(comments.filter(c => c.id !== tempId));
      setLocalCommentsCount(prev => prev - 1);
      updatePost({
        ...post,
        commentsCount: localCommentsCount
      });
    }
  }, [newComment, user, comments, isLoggedIn, redirectToLogin, localCommentsCount, post, updatePost]);

  useEffect(() => {
    if (showComments && !commentsLoaded) {
      listCommentsOnApi(post.id).then((data: Comment[]) => {
        setComments(data);
        setCommentsLoaded(true);
      }).catch(e => console.error("Failed to load comments", e));
    }
  }, [showComments, commentsLoaded, post.id]);

  const handleMenuToggle = useCallback(() => {
    setShowMenu(!showMenu);
  }, [showMenu]);

  const handleEditPost = useCallback(() => {
    if (!isLoggedIn) {
      redirectToLogin();
      return;
    }
    setEditForm({
      content: post.content,
      image: post.image
    });
    setShowEditModal(true);
    setShowMenu(false);
  }, [post, isLoggedIn, redirectToLogin]);

  const handleSaveEdit = useCallback(() => {
    if (!editForm.content.trim()) return;
    
    const updatedPost = {
      ...post,
      content: editForm.content,
      image: editForm.image
    };
    
    updatePost(updatedPost);
    setShowEditModal(false);
  }, [editForm, post, updatePost]);

  const handleDeletePost = useCallback(() => {
    if (!isLoggedIn) {
      redirectToLogin();
      return;
    }
    setShowDeleteConfirm(true);
    setShowMenu(false);
  }, [isLoggedIn, redirectToLogin]);

  const confirmDelete = useCallback(() => {
    deletePost(post.id);
    setShowDeleteConfirm(false);
  }, [post.id, deletePost]);

  const handleReportPost = useCallback(() => {
    if (!isLoggedIn) {
      redirectToLogin();
      return;
    }
    setShowReportModal(true);
    setShowMenu(false);
  }, [isLoggedIn, redirectToLogin]);

  const submitReport = useCallback(() => {
    if (!isLoggedIn) {
      redirectToLogin();
      return;
    }
    if (!reportReason.trim()) return;
    // TODO: Replace with API call to submit report
    setShowReportModal(false);
    setReportReason("");
  }, [reportReason, isLoggedIn, redirectToLogin]);

  return (
    <div className="relative isolate bg-white border-4 border-black p-6 md:p-8 flex flex-col gap-4 shadow-[6px_6px_0_0_#000] hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[8px_8px_0_0_#1d2cf3] transition-all group overflow-hidden">
      {/* Post Header */}
      <div className="flex justify-between items-center mb-2">
        <button
          type="button"
          onClick={() => {
            if (!isLoggedIn) {
              redirectToLogin();
              return;
            }
            router.push(`/clubs/${post.clubId}`);
          }}
          className="flex items-center gap-3 hover:translate-x-1 transition-transform text-left"
        >
          <div className="w-10 h-10 overflow-hidden rounded-xl border-2 border-black bg-white">
            <ImageWithFallback src={safeClubLogo} fallbackSrc="/globe.svg" alt={post.clubName} className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col">
            <span className="bg-black text-white text-xs font-black uppercase px-2 py-1 shadow-[2px_2px_0_0_#1d2cf3] inline-block mb-1">{post.clubName}</span>
            <span className="text-[10px] font-black uppercase text-gray-400">posted by {post.author}</span>
          </div>
        </button>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-gray-500 uppercase">{post.timestamp}</span>
          
          {/* Three-dot menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={handleMenuToggle}
              className="p-2 hover:bg-brutal-gray transition-colors border-2 border-transparent hover:border-black"
              aria-label="Post options"
            >
              <MoreHorizontal className="w-5 h-5 text-gray-600" />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 bg-white border-4 border-black shadow-[6px_6px_0_0_#000] z-50 min-w-[160px]">
                {isAuthor ? (
                  <>
                    <button
                      onClick={handleEditPost}
                      className="w-full px-4 py-3 text-left font-black uppercase text-sm hover:bg-brutal-gray transition-colors flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Edit Post
                    </button>
                    <button
                      onClick={handleDeletePost}
                      className="w-full px-4 py-3 text-left font-black uppercase text-sm hover:bg-brutal-gray transition-colors flex items-center gap-2 text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Post
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleReportPost}
                    className="w-full px-4 py-3 text-left font-black uppercase text-sm hover:bg-brutal-gray transition-colors flex items-center gap-2"
                  >
                    <Flag className="w-4 h-4" />
                    Report Post
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Post content - Clickable */}
      <button
        type="button"
        onClick={() => {
          if (!isLoggedIn) {
            redirectToLogin();
            return;
          }
          router.push(`/post/${post.id}`);
        }}
        className="block w-full bg-white text-left transition-opacity hover:opacity-80 focus:outline-none focus:bg-white active:bg-white"
      >
        <div className="space-y-4 bg-white">
          <p className="text-xl md:text-2xl font-black uppercase leading-tight text-black border-l-4 border-brutal-blue pl-4 py-1">{post.content}</p>
          {safePostImage && (
            <div className="relative group/image overflow-hidden border-4 border-black bg-white shadow-[4px_4px_0_0_#000]">
              <ImageWithFallback src={safePostImage} fallbackSrc="/window.svg" alt="Post visual" className="w-full h-auto max-h-[400px] object-cover hover:scale-105 transition-transform duration-500" />
              <div className="absolute top-4 right-4 bg-white border-2 border-black p-2 shadow-[2px_2px_0_0_#000] opacity-0 group-hover/image:opacity-100 transition-opacity cursor-pointer">
                <Expand className="w-5 h-5 text-black" />
              </div>
            </div>
          )}
        </div>
      </button>
      
      {/* Interaction Buttons */}
      <div className="flex items-center gap-4 md:gap-8 bg-white pt-6 mt-2 border-t-2 border-dashed border-gray-300">
        <button 
          onClick={toggleLike}
          className={`flex items-center gap-2 font-black uppercase text-sm px-4 py-2 border-2 border-black transition-all shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] ${liked ? 'bg-brutal-blue text-white' : 'bg-white text-black'}`}
        >
          <ArrowBigUp className={`w-5 h-5 ${liked ? 'fill-white' : ''}`} /> {likesCount}
        </button>
        
        <button 
          onClick={() => {
            if (!isLoggedIn) {
              redirectToLogin();
              return;
            }
            setShowComments(!showComments);
          }}
          className={`flex items-center gap-2 font-black uppercase text-sm px-4 py-2 border-2 border-black transition-all bg-brutal-gray text-black shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] ${showComments ? 'bg-black text-white' : ''}`}
        >
          <MessageSquare className="w-5 h-5" /> {localCommentsCount}
        </button>

        <button 
          onClick={sharePost}
          className="flex items-center gap-2 font-black uppercase text-sm px-4 py-2 border-2 border-black transition-all bg-brutal-gray text-black shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-brutal-blue hover:text-white"
        >
          <Share2 className="w-5 h-5" /> {shareCopied ? "Copied" : "Share"}
        </button>
      </div>

      {/* Demo Comments Section */}
      {showComments && (
        <div className="mt-4 pt-6 bg-white border-t-4 border-black -mx-6 -mb-6 md:-mx-8 md:-mb-8 p-6 md:p-8 space-y-4 animate-in slide-in-from-top-4 duration-300">
          <h4 className="text-sm font-black uppercase text-gray-500 mb-2">Discussion</h4>
          {!commentsLoaded ? (
            <p className="font-bold text-gray-400 italic">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="font-bold text-gray-400 italic">No comments yet. Start the conversation!</p>
          ) : (
            comments.map(comment => (
              <div key={comment.id} className="bg-white border-2 border-black p-4 shadow-[3px_3px_0_0_#000]">
                <span className="font-black text-[10px] uppercase text-brutal-blue block mb-1">{comment.author}</span>
                <p className="font-bold text-black">{comment.content}</p>
              </div>
            ))
          )}
          <div className="flex gap-2 mt-4">
            <input 
              type="text" 
              placeholder="Add your take..." 
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
              className="flex-1 bg-white border-2 border-black p-3 font-bold text-black focus:outline-none focus:shadow-[3px_3px_0_0_#1d2cf3] transition-all"
            />
            <button 
              onClick={handleAddComment}
              disabled={!newComment.trim()}
              className="bg-black text-white px-4 font-black uppercase text-xs border-2 border-black hover:bg-brutal-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Post
            </button>
          </div>
        </div>
      )}

      {/* Edit Post Modal */}
      {showEditModal && (
        <ModalShell
          className="bg-white border-8 border-black shadow-[16px_16px_0_0_#1d2cf3] max-w-2xl w-full max-h-[calc(100vh-3rem)] overflow-y-auto"
          onClose={() => setShowEditModal(false)}
        >
          <div>
            <div className="p-8">
              <div className="flex justify-between items-center mb-8 border-b-4 border-black pb-4">
                <h2 className="text-4xl font-black uppercase tracking-tighter">Edit Post</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-2 hover:bg-brutal-gray transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="font-black uppercase text-sm text-gray-600 tracking-widest mb-2 block">
                    Post Content
                  </label>
                  <textarea
                    value={editForm.content}
                    onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                    rows={4}
                    required
                    className="w-full border-4 border-black p-4 font-bold text-lg focus:outline-none focus:shadow-[4px_4px_0_0_#1d2cf3] resize-none"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 bg-black text-white px-8 py-4 font-black uppercase text-lg border-4 border-black shadow-[6px_6px_0_0_#1d2cf3] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 bg-white text-black px-8 py-4 font-black uppercase text-lg border-4 border-black shadow-[6px_6px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <ModalShell
          className="bg-white border-8 border-black shadow-[16px_16px_0_0_#1d2cf3] max-w-md w-full max-h-[calc(100vh-3rem)] overflow-y-auto"
          onClose={() => setShowDeleteConfirm(false)}
        >
          <div>
            <div className="p-8">
              <h2 className="text-3xl font-black uppercase tracking-tighter mb-4">Delete Post?</h2>
              <p className="font-bold text-lg mb-8">
                Are you sure you want to delete this post? This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-500 text-white px-6 py-3 font-black uppercase border-4 border-black shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-white text-black px-6 py-3 font-black uppercase border-4 border-black shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Report Post Modal */}
      {showReportModal && (
        <ModalShell
          className="bg-white border-8 border-black shadow-[16px_16px_0_0_#1d2cf3] max-w-md w-full max-h-[calc(100vh-3rem)] overflow-y-auto"
          onClose={() => setShowReportModal(false)}
        >
          <div>
            <div className="p-8">
              <div className="flex justify-between items-center mb-6 border-b-4 border-black pb-4">
                <h2 className="text-3xl font-black uppercase tracking-tighter">Report Post</h2>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="p-2 hover:bg-brutal-gray transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <p className="font-bold text-lg">Why are you reporting this post?</p>
                <div className="space-y-2">
                  {['Spam', 'Inappropriate content', 'Harassment', 'Other'].map((reason) => (
                    <label key={reason} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="reportReason"
                        value={reason}
                        checked={reportReason === reason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="w-4 h-4"
                      />
                      <span className="font-bold">{reason}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={submitReport}
                  disabled={!reportReason}
                  className="flex-1 bg-black text-white px-6 py-3 font-black uppercase border-4 border-black shadow-[4px_4px_0_0_#1d2cf3] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Report
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 bg-white text-black px-6 py-3 font-black uppercase border-4 border-black shadow-[6px_6px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export default memo(PostCard);
