"use client";

import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FileVideo2,
  Info,
  Link2Off,
  RefreshCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  TIKTOK_REVIEW_FIXTURE,
  TIKTOK_REVIEW_INTEGRATION_STATUS,
  TIKTOK_REVIEW_MODE,
  TIKTOK_REVIEW_STATUS_LABELS,
} from "@/lib/tiktok-review/fixture";
import type {
  ReviewContentChecks,
  ReviewMetadata,
  ReviewStep,
  ReviewVideoInfo,
} from "@/lib/tiktok-review/types";
import {
  MAX_CAPTION_LENGTH,
  MAX_INTERNAL_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  formatBytes,
  formatDuration,
  formatHashtags,
  validateContentChecks,
  validateReviewFile,
  validateReviewMetadata,
} from "@/lib/tiktok-review/validation";

const STEPS: Array<{ id: ReviewStep; short: string; label: string }> = [
  { id: 1, short: "계정", label: "예정 계정" },
  { id: 2, short: "영상", label: "영상 선택" },
  { id: 3, short: "재생", label: "미리보기" },
  { id: 4, short: "정보", label: "게시 정보" },
  { id: 5, short: "확인", label: "콘텐츠 확인" },
  { id: 6, short: "설정", label: "게시 설정" },
  { id: 7, short: "검증", label: "최종 검증" },
  { id: 8, short: "결과", label: "UI 결과" },
];

const EMPTY_METADATA: ReviewMetadata = {
  title: "",
  caption: "",
  hashtags: "",
  language: "ko",
  internalNote: "",
};

const EMPTY_CHECKS: ReviewContentChecks = {
  rightsConfirmed: false,
  noCopiedWatermark: false,
  privacyReviewed: false,
  guidelinesReviewed: false,
  aiContent: "",
  commercialContent: "",
};

const fieldClass = "mt-1 w-full border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-950 outline-none transition-colors focus:border-neutral-800 focus:ring-2 focus:ring-neutral-200";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 border px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45";

function ValidationNotice({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div role="alert" className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <ul className="space-y-1">
          {errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      </div>
    </div>
  );
}

function BinaryChoice({
  legend,
  name,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  value: "" | "yes" | "no";
  onChange: (value: "yes" | "no") => void;
}) {
  return (
    <fieldset className="border-t border-neutral-200 pt-4">
      <legend className="text-sm font-semibold text-neutral-900">{legend}</legend>
      <div className="mt-2 flex gap-2">
        {(["yes", "no"] as const).map((option) => (
          <label key={option} className={`flex min-h-11 min-w-24 cursor-pointer items-center gap-2 border px-3 text-sm ${value === option ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-800"}`}>
            <input className="size-4" type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            {option === "yes" ? "해당" : "해당 없음"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TikTokReviewForm() {
  const [step, setStep] = useState<ReviewStep>(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<ReviewStep>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<ReviewVideoInfo | null>(null);
  const [metadata, setMetadata] = useState<ReviewMetadata>(EMPTY_METADATA);
  const [checks, setChecks] = useState<ReviewContentChecks>(EMPTY_CHECKS);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");

  const releasePreview = useCallback(() => {
    if (!previewUrlRef.current) return;
    URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
  }, []);

  useEffect(() => releasePreview, [releasePreview]);

  const resetReview = useCallback(() => {
    releasePreview();
    setPreviewUrl("");
    setSelectedFile(null);
    setVideoInfo(null);
    setMetadata(EMPTY_METADATA);
    setChecks(EMPTY_CHECKS);
    setErrors([]);
    setMessage("시연 입력을 초기화했습니다. 영상이나 메타데이터는 저장되지 않았습니다.");
    setStep(1);
    setMaxUnlockedStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [releasePreview]);

  const chooseFile = useCallback((file: File | undefined) => {
    setErrors([]);
    setMessage("");
    if (!file) return;
    const validation = validateReviewFile(file);
    if (!validation.valid) {
      releasePreview();
      setPreviewUrl("");
      setSelectedFile(null);
      setVideoInfo(null);
      setErrors(validation.errors);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    releasePreview();
    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setSelectedFile(file);
    setVideoInfo(null);
    setMessage("영상이 브라우저 메모리에 준비됐습니다. 서버로 전송되지 않았습니다.");
  }, [releasePreview]);

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const metadataValidation = useMemo(() => validateReviewMetadata(metadata), [metadata]);
  const checkValidation = useMemo(() => validateContentChecks(checks), [checks]);
  const isPortrait = Boolean(videoInfo && videoInfo.height > videoInfo.width);

  function unlock(target: ReviewStep) {
    setMaxUnlockedStep((current) => Math.max(current, target) as ReviewStep);
    setStep(target);
    setErrors([]);
    setMessage("");
  }

  function goNext() {
    setErrors([]);
    setMessage("");
    if (step === 2 && !selectedFile) {
      setErrors(["등록 흐름을 확인할 MP4 또는 MOV 영상을 선택하세요."]);
      return;
    }
    if (step === 3 && !videoInfo) {
      setErrors(["영상 정보를 읽지 못했습니다. 재생 가능한 파일인지 확인하세요."]);
      return;
    }
    if (step === 4 && !metadataValidation.valid) {
      setErrors(metadataValidation.errors);
      return;
    }
    if (step === 5 && !checkValidation.valid) {
      setErrors(checkValidation.errors);
      return;
    }
    if (step === 7) {
      if (!selectedFile || !videoInfo || !metadataValidation.valid || !checkValidation.valid) {
        setErrors(["앞 단계의 영상, 게시 정보와 콘텐츠 확인을 다시 점검하세요."]);
        return;
      }
      setMessage("UI 입력 검증을 마쳤습니다. TikTok API는 호출하지 않았습니다.");
      setMaxUnlockedStep(8);
      setStep(8);
      return;
    }
    if (step < 8) unlock((step + 1) as ReviewStep);
  }

  const summaryRows = [
    ["파일", selectedFile ? formatBytes(selectedFile.size) : "선택 안 됨"],
    ["영상", videoInfo ? `${videoInfo.width}×${videoInfo.height} · ${formatDuration(videoInfo.durationSeconds)}` : "확인 전"],
    ["게시 정보", metadataValidation.valid ? "검증됨" : "미완료"],
    ["콘텐츠 확인", checkValidation.valid ? "완료" : "미완료"],
    ["TikTok API", "호출 없음"],
  ];

  return (
    <main
      className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-4 md:px-6"
      data-tiktok-review="true"
      data-review-mode={TIKTOK_REVIEW_MODE}
      data-integration-status={TIKTOK_REVIEW_INTEGRATION_STATUS}
      data-server-upload-enabled="false"
      data-production-submission-allowed="false"
    >
      <header className="mb-4 border-b border-neutral-300 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-neutral-500">알리닷 · 내부 관리자</p>
            <h1 className="mt-1 text-xl font-bold text-neutral-950">TikTok 영상 등록 UI</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">영상과 게시 정보를 검토하는 내부 prototype입니다. 실제 계정 연결이나 영상 전송은 수행하지 않습니다.</p>
          </div>
          <button type="button" className={`${buttonClass} border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50`} onClick={resetReview}>
            <RefreshCcw className="size-4" aria-hidden="true" />시연 초기화
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="연동 상태">
          {TIKTOK_REVIEW_STATUS_LABELS.map((label, index) => (
            <span key={label} className={`inline-flex min-h-8 items-center gap-1.5 border px-2.5 text-xs font-semibold ${index === 0 ? "border-blue-300 bg-blue-50 text-blue-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
              {index === 0 ? <Info className="size-3.5" aria-hidden="true" /> : <Ban className="size-3.5" aria-hidden="true" />}{label}
            </span>
          ))}
        </div>
      </header>

      <div aria-live="polite" className="min-h-0">
        {message && <div className="mb-4 flex items-start gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{message}</div>}
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_270px]">
        <nav className="grid grid-cols-4 gap-1 self-start border border-neutral-200 bg-white p-2 md:block" aria-label="영상 등록 단계">
          {STEPS.map((item) => {
            const disabled = item.id > maxUnlockedStep;
            const active = item.id === step;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                onClick={() => !disabled && setStep(item.id)}
                className={`flex min-h-14 w-full min-w-0 flex-col items-center justify-center border px-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 md:mb-1 md:min-h-11 md:flex-row md:justify-start md:gap-3 md:px-3 md:text-left ${active ? "border-neutral-900 bg-neutral-900 text-white" : disabled ? "border-transparent text-neutral-300" : "border-transparent text-neutral-600 hover:bg-neutral-50"}`}
              >
                <span className={`flex size-5 shrink-0 items-center justify-center border text-[11px] font-bold ${active ? "border-white" : "border-current"}`}>{item.id}</span>
                <span className="mt-1 min-w-0 text-[11px] font-semibold leading-4 md:mt-0 md:text-sm"><span className="md:hidden">{item.short}</span><span className="hidden md:inline">{item.label}</span></span>
              </button>
            );
          })}
        </nav>

        <section className="min-w-0 border border-neutral-200 bg-white p-4 md:p-5" data-review-step={step}>
          {step === 1 && (
            <div data-testid="review-account-step">
              <h2 className="text-lg font-bold text-neutral-950">향후 연결 계정 영역</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600">실제 TikTok 계정 정보가 아닌 화면 구조 확인용 예시입니다.</p>
              <div className="mt-5 flex flex-wrap items-center gap-4 border-y border-neutral-200 py-5">
                <div className="flex size-14 items-center justify-center border border-neutral-300 bg-neutral-50"><CircleUserRound className="size-7 text-neutral-500" aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><b>{TIKTOK_REVIEW_FIXTURE.displayName}</b><span className="border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-900">예시 데이터</span></div>
                  <p className="mt-1 text-sm text-neutral-600">연결 안 됨 · 실제 프로필 정보 없음</p>
                </div>
                <button type="button" disabled className={`${buttonClass} border-neutral-300 bg-neutral-100 text-neutral-500`}><Link2Off className="size-4" aria-hidden="true" />연결 기능 없음</button>
              </div>
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-neutral-900">향후 요청 예정 권한</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TIKTOK_REVIEW_FIXTURE.plannedScopes.map((scope) => <code key={scope} className="border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs">{scope}</code>)}
                </div>
                <p className="mt-2 text-xs leading-5 text-neutral-500">현재 승인되거나 요청된 권한이 아닙니다.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div data-testid="review-file-step">
              <h2 className="text-lg font-bold text-neutral-950">영상 선택</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600">MP4 또는 MOV 파일을 브라우저 메모리에서만 엽니다.</p>
              <div
                className={`mt-5 flex min-h-64 flex-col items-center justify-center border-2 border-dashed px-5 text-center transition-colors ${dragActive ? "border-neutral-900 bg-neutral-100" : "border-neutral-300 bg-neutral-50"}`}
                onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
                onDrop={onDrop}
                data-testid="review-drop-zone"
              >
                <Upload className="size-8 text-neutral-500" aria-hidden="true" />
                <b className="mt-3 text-sm">영상 파일을 놓거나 직접 선택하세요</b>
                <p className="mt-1 text-xs text-neutral-500">파일은 서버, DB 또는 외부 서비스로 전송되지 않습니다.</p>
                <label className={`${buttonClass} mt-4 cursor-pointer border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700`}>
                  <FileVideo2 className="size-4" aria-hidden="true" />파일 선택
                  <input ref={fileInputRef} data-testid="review-file-input" className="sr-only" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" onChange={onFileInput} />
                </label>
              </div>
              {selectedFile && <div className="mt-3 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><b>{selectedFile.name}</b><span className="ml-2">{formatBytes(selectedFile.size)}</span></div>}
            </div>
          )}

          {step === 3 && (
            <div data-testid="review-preview-step">
              <h2 className="text-lg font-bold text-neutral-950">영상 미리보기</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600">재생 가능 여부와 세로형 규격을 확인합니다.</p>
              <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(220px,360px)_minmax(0,1fr)]">
                <div className="mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden border border-neutral-300 bg-black">
                  {previewUrl && <video
                    key={previewUrl}
                    data-testid="review-video-preview"
                    className="size-full object-contain"
                    src={previewUrl}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(event) => {
                      const video = event.currentTarget;
                      if (!selectedFile) return;
                      setVideoInfo({ name: selectedFile.name, size: selectedFile.size, type: selectedFile.type, durationSeconds: video.duration, width: video.videoWidth, height: video.videoHeight });
                      setErrors([]);
                    }}
                    onError={() => { setVideoInfo(null); setErrors(["영상을 재생할 수 없습니다. 손상되지 않은 MP4 또는 MOV 파일을 선택하세요."]); }}
                  />}
                </div>
                <div className="self-start border-y border-neutral-200">
                  {[ ["파일", selectedFile?.name || "-"], ["크기", selectedFile ? formatBytes(selectedFile.size) : "-"], ["길이", videoInfo ? formatDuration(videoInfo.durationSeconds) : "읽는 중"], ["해상도", videoInfo ? `${videoInfo.width} × ${videoInfo.height}` : "읽는 중"], ["화면 방향", videoInfo ? (isPortrait ? "세로형" : "가로형 또는 정사각형") : "확인 전"] ].map(([label, value]) => <div key={label} className="grid grid-cols-[100px_minmax(0,1fr)] border-b border-neutral-200 py-3 text-sm last:border-b-0"><span className="font-semibold text-neutral-500">{label}</span><span className="min-w-0 break-words text-neutral-900">{value}</span></div>)}
                  {videoInfo && !isPortrait && <div className="mb-3 flex gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />세로형 9:16 영상을 권장합니다.</div>}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div data-testid="review-metadata-step">
              <h2 className="text-lg font-bold text-neutral-950">게시 정보</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600">입력 내용은 브라우저 메모리에만 유지되며 TikTok으로 전송되지 않습니다.</p>
              <div className="mt-5 grid gap-4">
                <label className="text-sm font-semibold text-neutral-900">제목 <span className="float-right font-normal text-neutral-500">{metadata.title.length}/{MAX_TITLE_LENGTH}</span><input data-testid="review-title" className={fieldClass} maxLength={MAX_TITLE_LENGTH} value={metadata.title} onChange={(event) => setMetadata({ ...metadata, title: event.target.value })} /></label>
                <label className="text-sm font-semibold text-neutral-900">설명·캡션 <span className="float-right font-normal text-neutral-500">{metadata.caption.length}/{MAX_CAPTION_LENGTH}</span><textarea data-testid="review-caption" className={`${fieldClass} min-h-32 resize-y`} maxLength={MAX_CAPTION_LENGTH} value={metadata.caption} onChange={(event) => setMetadata({ ...metadata, caption: event.target.value })} /></label>
                <label className="text-sm font-semibold text-neutral-900">해시태그<input data-testid="review-hashtags" className={fieldClass} value={metadata.hashtags} onBlur={() => setMetadata({ ...metadata, hashtags: formatHashtags(metadata.hashtags) })} onChange={(event) => setMetadata({ ...metadata, hashtags: event.target.value })} placeholder="#문화 #전시" /><span className="mt-1 block text-xs font-normal text-neutral-500">중복과 지원하지 않는 문자는 입력을 마치면 정리됩니다.</span></label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-neutral-900">콘텐츠 언어<select data-testid="review-language" className={fieldClass} value={metadata.language} onChange={(event) => setMetadata({ ...metadata, language: event.target.value })}><option value="ko">한국어</option><option value="en">영어</option><option value="ja">일본어</option><option value="other">기타</option></select></label>
                  <label className="text-sm font-semibold text-neutral-900">내부 관리 메모 <span className="float-right font-normal text-neutral-500">{metadata.internalNote.length}/{MAX_INTERNAL_NOTE_LENGTH}</span><textarea data-testid="review-internal-note" className={`${fieldClass} min-h-24 resize-y`} maxLength={MAX_INTERNAL_NOTE_LENGTH} value={metadata.internalNote} onChange={(event) => setMetadata({ ...metadata, internalNote: event.target.value })} /><span className="mt-1 block text-xs font-normal text-neutral-500">TikTok 전송 대상이 아닙니다.</span></label>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div data-testid="review-content-step">
              <h2 className="text-lg font-bold text-neutral-950">콘텐츠 확인</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600">모든 항목을 직접 확인해야 다음 단계로 이동할 수 있습니다.</p>
              <div className="mt-5 grid gap-3">
                {([
                  ["rightsConfirmed", "영상·음원·이미지·인물에 필요한 사용 권리를 보유했습니다."],
                  ["noCopiedWatermark", "제3자 플랫폼 워터마크를 제거한 복제물이 아닙니다."],
                  ["privacyReviewed", "개인정보 또는 민감정보 포함 여부를 확인했습니다."],
                  ["guidelinesReviewed", "TikTok 커뮤니티 가이드라인을 확인했습니다."],
                ] as const).map(([key, label]) => <label key={key} className={`flex min-h-12 cursor-pointer items-start gap-3 border px-3 py-3 text-sm ${checks[key] ? "border-emerald-400 bg-emerald-50 text-emerald-950" : "border-neutral-300 bg-white text-neutral-800"}`}><input data-testid={`review-check-${key}`} className="mt-0.5 size-4 shrink-0" type="checkbox" checked={checks[key]} onChange={(event) => setChecks({ ...checks, [key]: event.target.checked })} /><span>{label}</span></label>)}
                <BinaryChoice legend="AI 생성·변형 콘텐츠에 해당합니까?" name="ai-content" value={checks.aiContent} onChange={(value) => setChecks({ ...checks, aiContent: value })} />
                <BinaryChoice legend="광고·브랜드 콘텐츠에 해당합니까?" name="commercial-content" value={checks.commercialContent} onChange={(value) => setChecks({ ...checks, commercialContent: value })} />
              </div>
            </div>
          )}

          {step === 6 && (
            <div data-testid="review-settings-step">
              <h2 className="text-lg font-bold text-neutral-950">게시 설정 안내</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600">실제 TikTok 설정값을 조회하거나 선택하지 않습니다.</p>
              <div className="mt-5 border-y border-neutral-200">
                {[
                  ["게시 방식", "TikTok 받은편지함 업로드 예정"],
                  ["공개 범위", "TikTok에서 최종 확인 예정"],
                  ["댓글", "TikTok에서 최종 확인 예정"],
                  ["듀엣·이어붙이기", "TikTok에서 최종 확인 예정"],
                  ["자동 공개 게시", "제공하지 않음"],
                  ["예약 게시", "제공하지 않음"],
                ].map(([label, value]) => <div key={label} className="grid gap-1 border-b border-neutral-200 py-3 text-sm last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)]"><b className="text-neutral-600">{label}</b><span>{value}</span></div>)}
              </div>
              <div className="mt-4 flex items-start gap-2 border border-blue-300 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-950"><Info className="mt-1 size-4 shrink-0" aria-hidden="true" />실제 creator_info 응답이나 승인된 공개 범위처럼 보이는 선택지를 만들지 않았습니다.</div>
            </div>
          )}

          {step === 7 && (
            <div data-testid="review-final-step">
              <h2 className="text-lg font-bold text-neutral-950">최종 검증</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600">등록 흐름의 입력만 확인합니다. 외부 요청은 발생하지 않습니다.</p>
              <div className="mt-5 grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
                <div className="aspect-[9/16] overflow-hidden border border-neutral-300 bg-black">{previewUrl && <video className="size-full object-contain" src={previewUrl} muted playsInline preload="metadata" />}</div>
                <dl className="min-w-0 border-y border-neutral-200 text-sm">
                  {[
                    ["대상 계정", "TikTok 테스트 계정 · 예시 데이터 · 연결 안 됨"],
                    ["제목", metadata.title],
                    ["캡션", metadata.caption],
                    ["해시태그", formatHashtags(metadata.hashtags) || "없음"],
                    ["AI 콘텐츠", checks.aiContent === "yes" ? "해당" : "해당 없음"],
                    ["광고 콘텐츠", checks.commercialContent === "yes" ? "해당" : "해당 없음"],
                    ["API 상태", "not_connected · 호출 없음"],
                  ].map(([label, value]) => <div key={label} className="grid gap-1 border-b border-neutral-200 py-3 last:border-b-0 sm:grid-cols-[110px_minmax(0,1fr)]"><dt className="font-semibold text-neutral-500">{label}</dt><dd className="min-w-0 whitespace-pre-wrap break-words text-neutral-900">{value}</dd></div>)}
                </dl>
              </div>
              <div className="mt-4 flex items-start gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"><Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />이 확인은 TikTok 전송이나 Production 심사 제출을 실행하지 않습니다.</div>
            </div>
          )}

          {step === 8 && (
            <div className="text-center" data-testid="review-result-step">
              <CheckCircle2 className="mx-auto size-10 text-emerald-700" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold text-neutral-950">UI 입력 검증 완료</h2>
              <p className="mt-1 text-sm text-neutral-600">TikTok에 영상이 전송되지 않았습니다.</p>
              <div className="mx-auto mt-5 max-w-xl border-y border-neutral-200 text-left">
                {[
                  ["파일 검증", selectedFile && videoInfo ? "완료" : "미완료"],
                  ["메타데이터 검증", metadataValidation.valid ? "완료" : "미완료"],
                  ["권리 확인", checkValidation.valid ? "완료" : "미완료"],
                  ["TikTok API 호출", "없음"],
                  ["서버 영상 전송", "없음"],
                  ["Production 심사 제출", "금지 상태"],
                ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-neutral-200 py-3 text-sm last:border-b-0"><b className="text-neutral-600">{label}</b><span className="font-semibold text-neutral-900">{value}</span></div>)}
              </div>
              <button type="button" data-testid="review-reset" className={`${buttonClass} mt-5 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700`} onClick={resetReview}><RefreshCcw className="size-4" aria-hidden="true" />시연 초기화</button>
            </div>
          )}

          <ValidationNotice errors={errors} />

          {step < 8 && (
            <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-neutral-200 pt-4">
              <button type="button" className={`${buttonClass} border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50`} disabled={step === 1} onClick={() => { setErrors([]); setStep((step - 1) as ReviewStep); }}><ChevronLeft className="size-4" aria-hidden="true" />이전 단계</button>
              <button type="button" data-testid="review-next" className={`${buttonClass} border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700`} onClick={goNext}>{step === 7 ? "등록 흐름 확인" : "다음 단계"}<ChevronRight className="size-4" aria-hidden="true" /></button>
            </div>
          )}
        </section>

        <aside className="self-start border border-neutral-200 bg-white md:col-span-2 xl:col-span-1" aria-label="검증 요약">
          <div className="border-b border-neutral-200 px-4 py-3"><h2 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4" aria-hidden="true" />검증 요약</h2></div>
          <div className="px-4 py-2">
            {summaryRows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-3 border-b border-neutral-100 py-2.5 text-sm last:border-b-0"><span className="text-neutral-500">{label}</span><b className="min-w-0 break-words text-right text-neutral-900">{value}</b></div>)}
          </div>
          <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-5 text-neutral-600">영상과 입력 정보는 이 브라우저 탭을 벗어나지 않습니다. 새로고침하면 모두 초기화됩니다.</div>
        </aside>
      </div>
    </main>
  );
}

