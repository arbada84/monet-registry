"use client";

interface DashboardHistoryChartProps {
  data: {
    date: string;
    success: number;
    failure: number;
  }[];
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 240;
const PADDING = {
  top: 18,
  right: 18,
  bottom: 42,
  left: 42,
};
const SUCCESS_LABEL = "\uC131\uACF5";
const FAILURE_LABEL = "\uC2E4\uD328";
const SUCCESS_COLOR = "hsl(12, 76%, 61%)";
const FAILURE_COLOR = "hsl(173, 58%, 39%)";

export default function DashboardHistoryChart({ data }: DashboardHistoryChartProps) {
  const maxValue = Math.max(1, ...data.flatMap((point) => [point.success, point.failure]));
  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const groupWidth = innerWidth / Math.max(data.length, 1);
  const barWidth = Math.max(6, Math.min(22, (groupWidth - 14) / 2));
  const yForValue = (value: number) => PADDING.top + innerHeight - (value / maxValue) * innerHeight;
  const gridValues = Array.from({ length: 5 }, (_, index) => Math.round((maxValue / 4) * index));

  return (
    <div style={{ width: "100%", height: 240 }}>
      <svg
        role="img"
        aria-label={`${SUCCESS_LABEL} / ${FAILURE_LABEL} history chart`}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        <line
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={PADDING.top + innerHeight}
          stroke="#DADDE4"
        />
        <line
          x1={PADDING.left}
          y1={PADDING.top + innerHeight}
          x2={PADDING.left + innerWidth}
          y2={PADDING.top + innerHeight}
          stroke="#DADDE4"
        />
        {gridValues.map((value) => {
          const y = yForValue(value);
          return (
            <g key={value}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + innerWidth}
                y2={y}
                stroke="#EEF0F4"
                strokeDasharray="4 4"
              />
              <text x={PADDING.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#8A8F9C">
                {value}
              </text>
            </g>
          );
        })}
        {data.map((point, index) => {
          const groupX = PADDING.left + index * groupWidth + groupWidth / 2;
          const successHeight = PADDING.top + innerHeight - yForValue(point.success);
          const failureHeight = PADDING.top + innerHeight - yForValue(point.failure);
          return (
            <g key={`${point.date}-${index}`}>
              <rect
                x={groupX - barWidth - 2}
                y={yForValue(point.success)}
                width={barWidth}
                height={successHeight}
                rx="3"
                fill={SUCCESS_COLOR}
              >
                <title>{`${point.date} ${SUCCESS_LABEL}: ${point.success}`}</title>
              </rect>
              <rect
                x={groupX + 2}
                y={yForValue(point.failure)}
                width={barWidth}
                height={failureHeight}
                rx="3"
                fill={FAILURE_COLOR}
              >
                <title>{`${point.date} ${FAILURE_LABEL}: ${point.failure}`}</title>
              </rect>
              <text
                x={groupX}
                y={CHART_HEIGHT - 18}
                textAnchor="middle"
                fontSize="11"
                fill="#6B7280"
              >
                {point.date}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: -6, fontSize: 12, color: "#555" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: SUCCESS_COLOR }} />
          {SUCCESS_LABEL}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: FAILURE_COLOR }} />
          {FAILURE_LABEL}
        </span>
      </div>
    </div>
  );
}
