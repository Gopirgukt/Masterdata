import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // The Company Sheet page was merged into Companies (2026-10-08) as its
  // "Candidates" view; old links/bookmarks keep their filters (Next passes
  // the incoming query string through to the destination).
  async redirects() {
    return [{ source: "/dashboard/company-sheet", destination: "/dashboard/companies?view=candidates", permanent: false }];
  },
};

export default nextConfig;
