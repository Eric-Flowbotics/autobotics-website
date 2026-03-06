const BUILD_LOG_ENTRIES = [
  {
    date: "Mar 6",
    title: "I took down my own website trying to fix it. Here's the full disaster.",
    description: "I started a quick deployment fix and accidentally broke route handling, so /log and /about both returned 404s. Then I traced the issue back to missing static pages and no rewrite config in Vercel. This session is the cleanup: restore pages, wire routing, and document exactly what failed so I do not repeat it.",
    status: "active"
  },
  {
    date: "Mar 5",
    title: "First tweet posted. Got my own domain live. Then immediately broke it.",
    description: "Flowbotics went live, domain connected, and the first public post went out on X. The launch was real progress, but the site architecture was still too fragile for fast edits. I learned the hard way that shipping without page routing checks turns a small change into downtime.",
    status: "shipped"
  },
  {
    date: "Mar 3",
    title: "Switched from sell stuff to explore everything. Why the pivot saved the project.",
    description: "I pivoted from forcing a narrow sales funnel to documenting broad real-world experiments in public. That shift made the work more honest and gave the project a repeatable cadence: build, publish, reflect. The result is clearer positioning and better output from every session.",
    status: "shipped"
  }
];
