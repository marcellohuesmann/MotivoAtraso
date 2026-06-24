<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%@ page import="java.sql.*, java.util.*" %>
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

    Connection conn = null;
    try {
        conn = getConnection(application);
        JsonObject result = new JsonObject();

        // Direitos (papéis fixos do Multitone)
        Statement stRights = conn.createStatement();
        ResultSet rsRights = stRights.executeQuery("SELECT id_user_rights, user_rights FROM user_rights ORDER BY id_user_rights ASC");
        JsonArray rights = new JsonArray();
        while (rsRights.next()) {
            JsonObject r = new JsonObject();
            r.addProperty("id", rsRights.getInt("id_user_rights"));
            r.addProperty("name", rsRights.getString("user_rights"));
            rights.add(r);
        }
        rsRights.close(); stRights.close();
        result.add("rights", rights);

        // Leitos, agrupados em 3 níveis: Ala (building) > Andar (wing) > Quarto (room)
        Statement stBeds = conn.createStatement();
        ResultSet rsBeds = stBeds.executeQuery(
            "SELECT b.id_bed, b.bed, r.room, " +
            "COALESCE(w.wing, 'Sem Andar') AS wing, COALESCE(bld.building, 'Sem Ala') AS building " +
            "FROM beds b JOIN rooms r ON b.id_room = r.id_room " +
            "LEFT JOIN wings w ON r.id_wing = w.id_wing " +
            "LEFT JOIN buildings bld ON w.id_building = bld.id_building " +
            "ORDER BY building ASC, wing ASC, r.room ASC, b.bed ASC");
        result.add("beds", groupBedsHierarchy(rsBeds));
        rsBeds.close(); stBeds.close();

        // Tipos de evento, agrupados por categoria
        Statement stEvt = conn.createStatement();
        ResultSet rsEvt = stEvt.executeQuery(
            "SELECT e.id_event_type, e.event_type, COALESCE(c.event_category, 'Sem Categoria') AS event_category " +
            "FROM event_types e LEFT JOIN event_categories c ON e.id_event_category = c.id_event_category " +
            "ORDER BY event_category ASC, e.event_type ASC");
        result.add("eventTypes", groupRows(rsEvt, "event_category", "id_event_type", new String[]{"event_type"}, ""));
        rsEvt.close(); stEvt.close();

        // Grupos de atendimento, agrupados por tipo
        Statement stGrp = conn.createStatement();
        ResultSet rsGrp = stGrp.executeQuery(
            "SELECT g.id_staff_group, g.staff_group, COALESCE(t.staff_group_type, 'Sem Tipo') AS staff_group_type " +
            "FROM staff_groups g LEFT JOIN staff_group_types t ON g.id_staff_group_type = t.id_staff_group_type " +
            "ORDER BY staff_group_type ASC, g.staff_group ASC");
        result.add("staffGroups", groupRows(rsGrp, "staff_group_type", "id_staff_group", new String[]{"staff_group"}, ""));
        rsGrp.close(); stGrp.close();

        // Tipos de alarme (lista simples, sem agrupamento na origem)
        Statement stAlarm = conn.createStatement();
        ResultSet rsAlarm = stAlarm.executeQuery("SELECT id_alarm_type, alarm_type FROM alarm_types ORDER BY alarm_type ASC");
        JsonArray alarmTypes = new JsonArray();
        while (rsAlarm.next()) {
            JsonObject a = new JsonObject();
            a.addProperty("id", rsAlarm.getInt("id_alarm_type"));
            a.addProperty("label", rsAlarm.getString("alarm_type"));
            alarmTypes.add(a);
        }
        rsAlarm.close(); stAlarm.close();
        result.add("alarmTypes", alarmTypes);

        out.print(result.toString());
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
