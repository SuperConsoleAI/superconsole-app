// src/routes/dashboard/shop/restaurant/recipes/index.tsx
//
// Recipe & Bill of Materials (BOM) Manager — Path: /dashboard/shop/restaurant/recipes

import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LuBookOpen, LuLayers, LuPlus } from "@qwikest/icons/lucide";
import { RecipeBuilderSlideOver } from "~/components/shop/restaurant/RecipeBuilderSlideOver";
import { RestaurantContext } from "~/routes/dashboard/shop/restaurant/layout";

export interface BOMLine {
  id: string;
  component_item_id: string;
  component_item_name: string;
  qty_required: number;
  unit?: string;
  wastage_pct: number;
}

export default component$(() => {
  const ctx            = useContext(RestaurantContext);
  const showAddModal   = useSignal(false);

  return (
    <div>
      {/* Top Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <LuBookOpen style="width:1.25rem;height:1.25rem;color:var(--brand-primary);" />
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
            Recipe & BOM Manager
          </h2>
        </div>
        <button
          onClick$={() => (showAddModal.value = true)}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-text)",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <LuPlus style="width:1rem;height:1rem;" />
          Add Recipe
        </button>
      </div>

      {/* Content */}
      {ctx.loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading recipes...
        </div>
      ) : ctx.recipes.length === 0 ? (
        <div style={{ padding: "4rem 2rem", textAlign: "center", background: "var(--surface-2)", borderRadius: "0.75rem", border: "1px dashed var(--border)" }}>
          <LuBookOpen style="width:3rem;height:3rem;color:var(--text-secondary);margin-bottom:1rem;" />
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: 600 }}>No Dish Recipes Configured</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            Click "+ Add Recipe" above to link raw ingredients to menu dishes.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
          {ctx.recipes.map((rcp) => (
            <div
              key={rcp.id}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "0.75rem",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 600 }}>{rcp.item_name}</h4>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Yield: {rcp.yield_qty} {rcp.yield_unit || "portion"}
                  </div>
                </div>
                <LuLayers style="width:1.25rem;height:1.25rem;color:var(--brand-primary);" />
              </div>

              {/* Ingredients List */}
              <div style={{ background: "var(--surface-1)", padding: "0.75rem", borderRadius: "0.5rem", fontSize: "0.8125rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.35rem", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                  INGREDIENTS REQUIRED
                </div>
                {rcp.lines.map((line: any, idx: number) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", margin: "0.25rem 0" }}>
                    <span>{line.component_item_name}</span>
                    <span style={{ fontWeight: 600 }}>
                      {line.qty_required} {line.unit || "unit"} {line.wastage_pct > 0 ? `(+${line.wastage_pct}%)` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recipe Builder SlideOver */}
      <RecipeBuilderSlideOver
        open={showAddModal}
        onSaved$={$(async (newRecipe) => {
          ctx.recipes = [newRecipe, ...ctx.recipes];
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Recipe & BOM Manager | BusinessKit",
};
