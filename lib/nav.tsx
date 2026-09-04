import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      {children}
    </svg>
  );
}

export const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <Icon>
        <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
        <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
        <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
        <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/search",
    label: "Candidate Search",
    icon: (
      <Icon>
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M17 17l-4-4" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/today",
    label: "Today's Interviews",
    icon: (
      <Icon>
        <rect x="2.5" y="3.5" width="15" height="14" rx="1.5" />
        <path d="M2.5 7.5h15M6 2v3M14 2v3" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/pending",
    label: "Pending Actions",
    icon: (
      <Icon>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6v4l2.5 2.5" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/companies",
    label: "Company Analytics",
    icon: (
      <Icon>
        <path d="M3 17.5V4.5a1 1 0 011-1h5a1 1 0 011 1v13M10 17.5V9a1 1 0 011-1h5a1 1 0 011 1v8.5M3 17.5h14" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/interviewers",
    label: "Interviewer Report",
    icon: (
      <Icon>
        <circle cx="10" cy="6.5" r="3" />
        <path d="M3.5 17c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/rejections",
    label: "Rejection Analysis",
    icon: (
      <Icon>
        <path d="M4 17V9M10 17V3M16 17v-6" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/skills",
    label: "Skills Analytics",
    icon: (
      <Icon>
        <path d="M10 2.5l2.3 4.8 5.2.7-3.8 3.7.9 5.3-4.6-2.5-4.6 2.5.9-5.3-3.8-3.7 5.2-.7z" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/history",
    label: "Candidate History",
    icon: (
      <Icon>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6v4l3 2" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/pipeline",
    label: "Recruiter Pipeline",
    icon: (
      <Icon>
        <path d="M3 4.5h14L11.5 11v5l-3 1.5v-6.5z" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/company-sheet",
    label: "Company Sheet",
    icon: (
      <Icon>
        <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
        <path d="M7 6.5h6M7 9.5h6M7 12.5h3.5" />
      </Icon>
    ),
  },
  {
    href: "/dashboard/day-outcome",
    label: "Day Outcome",
    icon: (
      <Icon>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 5.5v5l3.5 2" />
      </Icon>
    ),
  },
];
