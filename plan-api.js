(function () {
  function getClientOrThrow() {
    if (!window.GutguardSupabase || !window.GutguardSupabase.isConfigured()) {
      throw new Error("Supabase is not configured.");
    }

    var client = window.GutguardSupabase.getClient();
    if (!client) {
      throw new Error("Supabase client is unavailable.");
    }

    return client;
  }

  async function getUserOrThrow() {
    if (!window.GutguardSupabase || !window.GutguardSupabase.getUser) {
      throw new Error("Supabase auth helpers are unavailable.");
    }

    var user = await window.GutguardSupabase.getUser();
    if (!user) {
      throw new Error("Please sign in before loading or saving plans.");
    }

    return user;
  }

  function normalizePlanRow(row) {
    return {
      id: row.id,
      user_id: row.user_id,
      parent_plan_id: row.parent_plan_id,
      owner_role: row.owner_role,
      role_type: row.role_type,
      status: row.status,
      full_name: row.full_name,
      start_date: row.start_date,
      calendar_start_date: row.calendar_start_date,
      target_pi: Number(row.target_pi || 0),
      target_sales: Number(row.target_sales || 0),
      info_fields: row.info || {},
      checklist: Array.isArray(row.checklist) ? row.checklist : [],
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  function summarizeChildPlan(plan, weekRows) {
    var totals = { leads: 0, attendees: 0, pay_ins: 0, sales: 0 };
    (weekRows || []).forEach(function (row) {
      totals.leads += Number(row.leads || 0);
      totals.attendees += Number(row.attendees || 0);
      totals.pay_ins += Number(row.pay_ins || 0);
      totals.sales += Number(row.sales || 0);
    });

    return {
      id: plan.id,
      parent_plan_id: plan.parent_plan_id,
      role_type: plan.role_type,
      full_name: plan.full_name,
      target_pi: Number(plan.target_pi || 0),
      target_sales: Number(plan.target_sales || 0),
      totals: totals,
      updated_at: plan.updated_at,
      created_at: plan.created_at
    };
  }

  async function listPlans(roleType) {
    var client = getClientOrThrow();
    await getUserOrThrow();

    var query = client
      .from("plans")
      .select("id, role_type, full_name, status, updated_at, created_at, parent_plan_id, owner_role")
      .order("updated_at", { ascending: false });

    if (roleType) {
      query = query.eq("role_type", roleType);
    }

    var result = await query;
    if (result.error) {
      throw new Error(result.error.message);
    }

    return (result.data || []).map(function (row) {
      return {
        id: row.id,
        role_type: row.role_type,
        full_name: row.full_name,
        status: row.status,
        updated_at: row.updated_at,
        created_at: row.created_at,
        parent_plan_id: row.parent_plan_id,
        owner_role: row.owner_role
      };
    });
  }

  async function listPotentialParents(roleType) {
    var parentRoleMap = {
      member: "leader",
      leader: "squad",
      squad: "platoon",
      platoon: "o1"
    };
    var parentRole = parentRoleMap[roleType];
    if (!parentRole) {
      return [];
    }
    return listPlans(parentRole);
  }

  async function listChildPlans(parentPlanId) {
    var client = getClientOrThrow();
    await getUserOrThrow();

    var plansResult = await client
      .from("plans")
      .select("id, parent_plan_id, role_type, full_name, target_pi, target_sales, updated_at, created_at")
      .eq("parent_plan_id", parentPlanId)
      .order("updated_at", { ascending: false });

    if (plansResult.error) {
      throw new Error(plansResult.error.message);
    }

    var childPlans = plansResult.data || [];
    if (!childPlans.length) {
      return [];
    }

    var ids = childPlans.map(function (plan) { return plan.id; });
    var weekResult = await client
      .from("plan_week_entries")
      .select("plan_id, leads, attendees, pay_ins, sales")
      .in("plan_id", ids);

    if (weekResult.error) {
      throw new Error(weekResult.error.message);
    }

    var weeksByPlan = {};
    (weekResult.data || []).forEach(function (row) {
      if (!weeksByPlan[row.plan_id]) {
        weeksByPlan[row.plan_id] = [];
      }
      weeksByPlan[row.plan_id].push(row);
    });

    return childPlans.map(function (plan) {
      return summarizeChildPlan(plan, weeksByPlan[plan.id] || []);
    });
  }

  async function savePlanToSupabase(plan) {
    var client = getClientOrThrow();
    var user = await getUserOrThrow();

    var baseRow = {
      user_id: user.id,
      parent_plan_id: plan.parent_plan_id || null,
      owner_role: plan.owner_role || plan.role_type,
      role_type: plan.role_type,
      full_name: plan.full_name,
      start_date: plan.start_date,
      calendar_start_date: plan.calendar_start_date,
      target_pi: plan.target_pi || 0,
      target_sales: plan.target_sales || 0,
      info: plan.info_fields || {},
      checklist: plan.checklist || [],
      status: plan.status || "submitted",
      updated_at: new Date().toISOString()
    };

    var mainResult;
    if (plan.id) {
      mainResult = await client
        .from("plans")
        .update(baseRow)
        .eq("id", plan.id)
        .select("*")
        .single();
    } else {
      mainResult = await client
        .from("plans")
        .insert(baseRow)
        .select("*")
        .single();
    }

    if (mainResult.error) {
      throw new Error(mainResult.error.message);
    }

    var savedPlan = mainResult.data;

    var deleteWeeks = await client
      .from("plan_week_entries")
      .delete()
      .eq("plan_id", savedPlan.id);
    if (deleteWeeks.error) {
      throw new Error(deleteWeeks.error.message);
    }

    var deleteConsolidation = await client
      .from("plan_consolidation_entries")
      .delete()
      .eq("plan_id", savedPlan.id);
    if (deleteConsolidation.error) {
      throw new Error(deleteConsolidation.error.message);
    }

    if (plan.week_entries && plan.week_entries.length) {
      var weekRows = plan.week_entries.map(function (entry) {
        return {
          plan_id: savedPlan.id,
          week_number: entry.week_number,
          activity_name: entry.activity_name,
          activity_date: entry.activity_date,
          leads: entry.leads || 0,
          attendees: entry.attendees || 0,
          pay_ins: entry.pay_ins || 0,
          sales: entry.sales || 0,
          extra: entry.extra || {}
        };
      });

      var insertWeeks = await client.from("plan_week_entries").insert(weekRows);
      if (insertWeeks.error) {
        throw new Error(insertWeeks.error.message);
      }
    }

    if (plan.consolidation_entries && plan.consolidation_entries.length) {
      var consolidationRows = plan.consolidation_entries.map(function (entry) {
        return {
          plan_id: savedPlan.id,
          name: entry.name,
          role_label: entry.role_label || "",
          leads: entry.leads || 0,
          att: entry.att || 0,
          pi: entry.pi || 0,
          sales: entry.sales || 0,
          evt: entry.evt || 0,
          pi_target: entry.pi_target || entry.pi || 0
        };
      });

      var insertConsolidation = await client
        .from("plan_consolidation_entries")
        .insert(consolidationRows);
      if (insertConsolidation.error) {
        throw new Error(insertConsolidation.error.message);
      }
    }

    return normalizePlanRow(savedPlan);
  }

  async function loadPlanFromSupabase(planId) {
    var client = getClientOrThrow();
    await getUserOrThrow();

    var planResult = await client
      .from("plans")
      .select("*")
      .eq("id", planId)
      .maybeSingle();
    if (planResult.error) {
      throw new Error(planResult.error.message);
    }
    if (!planResult.data) {
      throw new Error("Saved plan not found in Supabase.");
    }

    var weekResult = await client
      .from("plan_week_entries")
      .select("*")
      .eq("plan_id", planId)
      .order("week_number", { ascending: true })
      .order("activity_name", { ascending: true });
    if (weekResult.error) {
      throw new Error(weekResult.error.message);
    }

    var consolidationResult = await client
      .from("plan_consolidation_entries")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true });
    if (consolidationResult.error) {
      throw new Error(consolidationResult.error.message);
    }

    var plan = normalizePlanRow(planResult.data);
    plan.week_entries = (weekResult.data || []).map(function (row) {
      return {
        week_number: row.week_number,
        activity_name: row.activity_name,
        activity_date: row.activity_date,
        leads: Number(row.leads || 0),
        attendees: Number(row.attendees || 0),
        pay_ins: Number(row.pay_ins || 0),
        sales: Number(row.sales || 0),
        extra: row.extra || {}
      };
    });
    plan.consolidation_entries = (consolidationResult.data || []).map(function (row) {
      return {
        name: row.name,
        role_label: row.role_label,
        leads: Number(row.leads || 0),
        att: Number(row.att || 0),
        pi: Number(row.pi || 0),
        sales: Number(row.sales || 0),
        evt: Number(row.evt || 0),
        pi_target: Number(row.pi_target || 0)
      };
    });

    return plan;
  }

  window.GutguardPlanApi = {
    isConfigured: function () {
      return !!(window.GutguardSupabase && window.GutguardSupabase.isConfigured());
    },
    listPlans: listPlans,
    listPotentialParents: listPotentialParents,
    listChildPlans: listChildPlans,
    savePlanToSupabase: savePlanToSupabase,
    loadPlanFromSupabase: loadPlanFromSupabase
  };
})();
