"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Comment } from "@/types/article";

interface CommentSectionProps {
  articleId: string;
  articleTitle?: string;
  disabled?: boolean;
}

const COMMENTS_PER_PAGE = 10;

export default function CommentSection({ articleId, articleTitle, disabled }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [commentPage, setCommentPage] = useState(1);
  const [replyTo, setReplyTo] = useState<Comment | null>(null); // 답글 대상
  const isDirtyRef = useRef(false);

  // 댓글 작성 중 페이지 이탈 경고
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // 댓글 입력 시 dirty 플래그
  useEffect(() => {
    isDirtyRef.current = commentContent.trim().length > 0;
  }, [commentContent]);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(`/api/db/comments?articleId=${encodeURIComponent(articleId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("fetch failed");
      const d = await res.json();
      setComments(d.comments ?? []);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    if (!disabled) fetchComments();
  }, [fetchComments, disabled]);

  const handleCommentSubmit = async () => {
    if (!commentAuthor.trim() || !commentContent.trim()) return;
    if (commentSubmitting) return;
    setCommentSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/db/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          articleTitle,
          author: commentAuthor.trim(),
          content: commentContent.trim(),
          parentId: replyTo?.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCommentAuthor("");
        setCommentContent("");
        setReplyTo(null);
        isDirtyRef.current = false;
        setSubmitResult({ ok: true, msg: data.message ?? "댓글이 등록되었습니다. 관리자 승인 후 게시됩니다." });
        setCommentPage(1);
        await fetchComments();
      } else {
        setSubmitResult({ ok: false, msg: data.error ?? "댓글 등록에 실패했습니다." });
      }
    } catch {
      setSubmitResult({ ok: false, msg: "댓글 등록에 실패했습니다." });
    }
    setCommentSubmitting(false);
  };

  // 루트 댓글만 페이지네이션, 답글은 부모 댓글 바로 아래 표시
  const rootComments = comments.filter((c) => !c.parentId);
  const totalCommentPages = Math.max(1, Math.ceil(rootComments.length / COMMENTS_PER_PAGE));
  const pagedRoots = rootComments.slice(
    (commentPage - 1) * COMMENTS_PER_PAGE,
    commentPage * COMMENTS_PER_PAGE
  );

  // disabled 처리: 모든 hooks 호출 후 조건부 렌더링
  if (disabled) return null;

  return (
    <div className="mt-8">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        댓글 {comments.length > 0 && <span aria-live="polite">({comments.length})</span>}
      </h3>

      {/* 결과 메시지 */}
      {submitResult && (
        <div
          role="alert"
          className={`mb-4 px-4 py-3 rounded text-sm ${
            submitResult.ok
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {submitResult.msg}
        </div>
      )}

      {/* 댓글 폼 */}
      <div className="border border-gray-200 rounded p-4 mb-6">
        {replyTo && (
          <div className="flex items-center justify-between mb-2 px-3 py-2 bg-gray-50 rounded text-xs text-gray-500">
            <span><span className="font-medium">{replyTo.author}</span> 님에게 답글</span>
            <button
              onClick={() => setReplyTo(null)}
              className="text-gray-400 hover:text-red-500 transition-colors"
              aria-label="답글 취소"
            >
              ✕
            </button>
          </div>
        )}
        <label htmlFor="comment-author" className="sr-only">닉네임</label>
        <input
          id="comment-author"
          type="text"
          placeholder="닉네임"
          value={commentAuthor}
          onChange={(e) => setCommentAuthor(e.target.value)}
          aria-label="닉네임"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2 outline-none focus:border-[#E8192C]"
          maxLength={20}
        />
        <textarea
          placeholder={replyTo ? `${replyTo.author} 님에게 답글...` : "댓글을 입력하세요"}
          value={commentContent}
          onChange={(e) => setCommentContent(e.target.value)}
          aria-label="댓글 내용"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2 outline-none focus:border-[#E8192C] resize-none"
          rows={3}
          maxLength={500}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{commentContent.length}/500</span>
          <button
            onClick={handleCommentSubmit}
            disabled={commentSubmitting || !commentAuthor.trim() || !commentContent.trim()}
            className="px-4 py-2 text-xs text-white rounded disabled:opacity-50"
            style={{ background: "#E8192C" }}
            aria-label={replyTo ? "답글 등록" : "댓글 등록"}
          >
            {commentSubmitting ? "등록 중..." : replyTo ? "답글 등록" : "댓글 등록"}
          </button>
        </div>
      </div>

      {/* 로딩 스켈레톤 */}
      {loading &&
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid #EEE" }}>
            <div style={{ height: 12, width: 80, background: "#EEE", borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 12, width: "90%", background: "#EEE", borderRadius: 4 }} />
          </div>
        ))}

      {/* 에러 처리 */}
      {!loading && fetchError && (
        <div role="alert" className="py-8 text-center text-sm text-gray-500">
          <p className="mb-2">댓글을 불러오지 못했습니다.</p>
          <button
            onClick={fetchComments}
            className="px-4 py-1.5 rounded text-sm text-white"
            style={{ background: "#E8192C" }}
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 댓글 목록 */}
      {!loading && !fetchError && (
        <>
          {rootComments.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-8">첫 번째 댓글을 남겨보세요!</div>
          ) : (
            <>
              <div className="space-y-4">
                {pagedRoots.map((c) => {
                  const replies = comments.filter((r) => r.parentId === c.id);
                  return (
                    <div key={c.id}>
                      {/* 루트 댓글 */}
                      <div className="border-b border-gray-100 pb-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{c.author}</span>
                            <span className="text-xs text-gray-400" suppressHydrationWarning>{c.createdAt ? new Date(c.createdAt).toLocaleString("ko-KR") : ""}</span>
                          </div>
                          <button
                            onClick={() => setReplyTo(replyTo?.id === c.id ? null : c)}
                            className="text-xs text-gray-400 hover:text-[#E8192C] transition-colors"
                          >
                            답글
                          </button>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{c.content}</p>
                      </div>

                      {/* 답글 목록 */}
                      {replies.length > 0 && (
                        <div className="ml-6 mt-2 space-y-3">
                          {replies.map((r) => (
                            <div key={r.id} className="border-b border-gray-50 pb-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[11px] text-gray-400">↳</span>
                                <span className="text-sm font-medium text-gray-800">{r.author}</span>
                                <span className="text-xs text-gray-400" suppressHydrationWarning>{r.createdAt ? new Date(r.createdAt).toLocaleString("ko-KR") : ""}</span>
                              </div>
                              <p className="text-sm text-gray-700 leading-relaxed" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{r.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 페이지네이션 (10개 초과 시에만 표시) */}
              {rootComments.length > COMMENTS_PER_PAGE && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  <button
                    onClick={() => setCommentPage((p) => Math.max(1, p - 1))}
                    disabled={commentPage === 1}
                    aria-label="이전 댓글 페이지"
                    className="px-3 py-1.5 border rounded text-sm"
                    style={commentPage === 1 ? { borderColor: "#E5E7EB", color: "#D1D5DB" } : { borderColor: "#D1D5DB", color: "#374151" }}
                  >
                    이전
                  </button>
                  <span className="text-sm text-gray-500" aria-live="polite">{commentPage} / {totalCommentPages}</span>
                  <button
                    onClick={() => setCommentPage((p) => Math.min(totalCommentPages, p + 1))}
                    disabled={commentPage === totalCommentPages}
                    aria-label="다음 댓글 페이지"
                    className="px-3 py-1.5 border rounded text-sm"
                    style={commentPage === totalCommentPages ? { borderColor: "#E5E7EB", color: "#D1D5DB" } : { borderColor: "#D1D5DB", color: "#374151" }}
                  >
                    다음
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
