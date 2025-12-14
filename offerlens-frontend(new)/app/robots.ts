import { MetadataRoute } from "next"

/**
 * Generates the robots.txt file for the application
 * Requirements: 11.5 - Provide robots.txt with appropriate directives
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://offerlens.com"

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/results", // User-specific results should not be indexed
          "/api/", // API routes should not be crawled
          "/_next/", // Next.js internal files
          "/static/", // Static files
        ],
      },
      {
        userAgent: "GPTBot", // OpenAI's crawler
        disallow: "/", // Prevent AI training on user data
      },
      {
        userAgent: "CCBot", // Common Crawl bot
        disallow: "/", // Prevent scraping
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
