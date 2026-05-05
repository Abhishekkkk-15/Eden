import { useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";
import { getListSourcesQueryKey } from "@workspace/api-client-react";

export function useBulkTagSources() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, tags }: { ids: number[]; tags: string[] }) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/sources/bulk/tags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids, tags }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to bulk tag sources");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
    },
  });
}
