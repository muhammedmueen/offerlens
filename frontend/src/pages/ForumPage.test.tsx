import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Field names here are the backend's (forum.service.ts): `authorName` and `content` on list rows
// and comments, `author` and `content` on the post detail. The page used to read `body` and
// `author.name`, which rendered blank text and "Anonymous" everywhere.

const POST_ID = "8b6f3c52-3a64-4b21-9d5e-0f5c1c2a7e11";
const list = [{ id: POST_ID, title: "Is 30% a good hike?", category: "negotiation", authorName: "Asha", createdAt: "2026-10-01T00:00:00Z", commentCount: 2 }];
const detail = {
  id: POST_ID, title: "Is 30% a good hike?", content: "I got 30% over my current CTC.", category: "negotiation",
  createdAt: "2026-10-01T00:00:00Z", author: { id: "u1", name: "Asha" },
  comments: [{ id: "c1", content: "Looks fine to me", authorName: "Ravi", createdAt: "2026-10-02T00:00:00Z" }],
};

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(async (url: string) => ({ data: { data: url.endsWith(POST_ID) ? detail : list } })),
    post: vi.fn(async () => ({ data: { data: {} } })),
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
// framer-motion's in-view observer needs IntersectionObserver, which jsdom lacks.
vi.mock("@/components/common/MotionCard", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/layout/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const { default: ForumListPage, ForumPostPage } = await import("./ForumPage");
const { default: api } = await import("@/services/api");

const renderAt = (path: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/forum" element={<ForumListPage />} />
          <Route path="/forum/:id" element={<ForumPostPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Forum list", () => {
  it("shows the real author name, not Anonymous", async () => {
    renderAt("/forum");
    expect(await screen.findByText(/Asha/)).toBeTruthy();
    expect(screen.queryByText(/Anonymous/)).toBeNull();
  });

  it("filters by a category from the fixed list", async () => {
    renderAt("/forum");
    await screen.findByText(/Asha/);
    fireEvent.click(screen.getByRole("button", { name: "career" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/forum/posts", { params: { page: 1, category: "career" } }),
    );
  });

  it("creates a post with `content` and the default category, never `body`", async () => {
    renderAt("/forum");
    await screen.findByText(/Asha/);
    fireEvent.click(screen.getByRole("button", { name: /New Post/ }));
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Hello there" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Some text" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/forum/posts", { title: "Hello there", content: "Some text", category: "general" }),
    );
  });
});

describe("Forum post detail", () => {
  it("renders the post content and the comment text and author", async () => {
    renderAt(`/forum/${POST_ID}`);
    expect(await screen.findByText("I got 30% over my current CTC.")).toBeTruthy();
    expect(screen.getByText("Looks fine to me")).toBeTruthy();
    expect(screen.getByText(/Ravi/)).toBeTruthy();
  });

  it("posts a comment as `content`", async () => {
    renderAt(`/forum/${POST_ID}`);
    fireEvent.change(await screen.findByPlaceholderText("Write a comment…"), { target: { value: "Nice" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(`/forum/posts/${POST_ID}/comments`, { content: "Nice" }),
    );
  });
});
