<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%@ page import="java.sql.*, java.io.*, java.util.*" %>
<%@ page import="com.google.gson.*" %>
<%@ include file="db_init.jsp" %>
<%@ include file="user_helpers.jsp" %>
<%
    request.setCharacterEncoding("UTF-8");
    response.setCharacterEncoding("UTF-8");
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    Boolean auth = (Boolean) session.getAttribute("authenticated");
    if (auth == null || !auth) {
        response.setStatus(401);
        out.print("{\"error\":\"Acesso não autorizado.\"}");
        return;
    }

    if (!"POST".equalsIgnoreCase(request.getMethod())) {
        response.setStatus(405);
        out.print("{\"error\":\"Método não permitido.\"}");
        return;
    }

    Connection conn = null;
    try {
        BufferedReader reader = request.getReader();
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line);
        }

        JsonParser parser = new JsonParser();
        JsonObject data = parser.parse(sb.toString().trim()).getAsJsonObject();

        if (!data.has("sourceId") || !data.has("targetIds")) {
            response.setStatus(400);
            out.print("{\"error\":\"Usuário modelo e usuários de destino são obrigatórios.\"}");
            return;
        }

        int sourceId = data.get("sourceId").getAsInt();
        List<Integer> targetIds = jsonArrayToIntList(data.getAsJsonArray("targetIds"));
        targetIds.remove(Integer.valueOf(sourceId));

        if (targetIds.isEmpty()) {
            response.setStatus(400);
            out.print("{\"error\":\"Selecione ao menos um usuário de destino diferente do usuário modelo.\"}");
            return;
        }

        JsonObject copy = data.has("copy") ? data.getAsJsonObject("copy") : new JsonObject();
        boolean copyRights = copy.has("rights") && copy.get("rights").getAsBoolean();
        boolean copyBeds = copy.has("beds") && copy.get("beds").getAsBoolean();
        boolean copyEventTypes = copy.has("eventTypes") && copy.get("eventTypes").getAsBoolean();
        boolean copyStaffGroups = copy.has("staffGroups") && copy.get("staffGroups").getAsBoolean();
        boolean copyAlarmTypes = copy.has("alarmTypes") && copy.get("alarmTypes").getAsBoolean();
        boolean copyPreferences = copy.has("preferences") && copy.get("preferences").getAsBoolean();

        if (!copyRights && !copyBeds && !copyEventTypes && !copyStaffGroups && !copyAlarmTypes && !copyPreferences) {
            response.setStatus(400);
            out.print("{\"error\":\"Selecione ao menos uma configuração para replicar.\"}");
            return;
        }

        conn = getConnection(application);

        PreparedStatement psSrc = conn.prepareStatement("SELECT id_user_rights, preferences FROM users WHERE id_user = ?");
        psSrc.setInt(1, sourceId);
        ResultSet rsSrc = psSrc.executeQuery();
        if (!rsSrc.next()) {
            rsSrc.close(); psSrc.close();
            response.setStatus(404);
            out.print("{\"error\":\"Usuário modelo não localizado.\"}");
            return;
        }
        int srcRights = rsSrc.getInt("id_user_rights");
        String srcPreferences = rsSrc.getString("preferences");
        rsSrc.close(); psSrc.close();

        List<Integer> srcBeds = copyBeds ? loadChildIds(conn, "user_beds", "id_bed", sourceId) : null;
        List<Integer> srcEventTypes = copyEventTypes ? loadChildIds(conn, "user_event_types", "id_event_type", sourceId) : null;
        List<Integer> srcStaffGroups = copyStaffGroups ? loadChildIds(conn, "user_staff_groups", "id_staff_group", sourceId) : null;
        List<Integer> srcAlarmTypes = copyAlarmTypes ? loadChildIds(conn, "user_alarm_types", "id_alarm_type", sourceId) : null;

        conn.setAutoCommit(false);
        int applied = 0;
        try {
            for (Integer targetId : targetIds) {
                if (copyRights) {
                    PreparedStatement ps = conn.prepareStatement("UPDATE users SET id_user_rights = ? WHERE id_user = ?");
                    ps.setInt(1, srcRights);
                    ps.setInt(2, targetId);
                    ps.executeUpdate();
                    ps.close();
                }
                if (copyPreferences) {
                    PreparedStatement ps = conn.prepareStatement("UPDATE users SET preferences = ? WHERE id_user = ?");
                    ps.setString(1, srcPreferences);
                    ps.setInt(2, targetId);
                    ps.executeUpdate();
                    ps.close();
                }
                if (copyBeds) replaceChildAssoc(conn, "user_beds", "id_bed", targetId, srcBeds);
                if (copyEventTypes) replaceChildAssoc(conn, "user_event_types", "id_event_type", targetId, srcEventTypes);
                if (copyStaffGroups) replaceChildAssoc(conn, "user_staff_groups", "id_staff_group", targetId, srcStaffGroups);
                if (copyAlarmTypes) replaceChildAssoc(conn, "user_alarm_types", "id_alarm_type", targetId, srcAlarmTypes);
                applied++;
            }
            conn.commit();
        } catch (Exception ex) {
            conn.rollback();
            throw ex;
        } finally {
            conn.setAutoCommit(true);
        }

        JsonObject res = new JsonObject();
        res.addProperty("success", true);
        res.addProperty("applied", applied);
        res.addProperty("message", "Configurações replicadas para " + applied + " usuário(s) com sucesso!");
        out.print(res.toString());

    } catch (Exception e) {
        response.setStatus(500);
        String err = e.getMessage() != null ? e.getMessage() : "Erro desconhecido";
        out.print("{\"error\":\"" + err.replace("\"", "\\\"") + "\"}");
    } finally {
        if (conn != null) {
            try { conn.close(); } catch (Exception e) {}
        }
    }
%>
