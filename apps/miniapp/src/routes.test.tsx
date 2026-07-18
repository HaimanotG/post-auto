import { RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { router } from "./routes";

describe("routes", () => {
  it.each([
    ["/", "PostAuto"],
    ["/composer", "Composer"],
    ["/inbox", "Inbox"],
    ["/analytics", "Analytics"],
    ["/marketplace", "Marketplace"],
  ])("renders the %s route stub", async (path, heading) => {
    await router.navigate({ to: path });
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });
});
