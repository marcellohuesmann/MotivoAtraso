<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%@ page import="java.sql.*, java.io.*, java.util.*" %>
<%@ page import="com.google.gson.*" %>
<%@ include file="db_init.jsp" %>
<%@ include file="user_helpers.jsp" %>
<%!
    // Igual a groupRows() de user_helpers.jsp, mas preservando cor/fundo do evento para o seletor e os badges da grade.
    private static JsonArray groupEventTypesWithColor(ResultSet rs) throws SQLException {
        LinkedHashMap<String, JsonArray> groups = new LinkedHashMap<String, JsonArray>();
        while (rs.next()) {
            String groupName = rs.getString("event_category");
            JsonArray items = groups.get(groupName);
            if (items == null) {
                items = new JsonArray();
                groups.put(groupName, items);
            }
            JsonObject item = new JsonObject();
            item.addProperty("id", rs.getInt("id_event_type"));
            item.addProperty("label", rs.getString("event_type"));
            item.addProperty("color", rs.getString("color"));
            item.addProperty("background", rs.getString("background"));
            items.add(item);
        }
        JsonArray result = new JsonArray();
        for (Map.Entry<String, JsonArray> entry : groups.entrySet()) {
            JsonObject g = new JsonObject();
            g.addProperty("group", entry.getKey());
            g.add("items", entry.getValue());
            result.add(g);
        }
        return result;
    }

    // Busca a tarefa hoje associada a um leito+evento (ou null se não houver). Usado para detectar conflitos antes de aplicar.
    private static Integer findCurrentTask(Connection conn, int idBed, int idEventType) throws SQLException {
        PreparedStatement ps = conn.prepareStatement("SELECT id_task FROM bed_event_tasks WHERE id_bed = ? AND id_event_type = ?");
        ps.setInt(1, idBed);
        ps.setInt(2, idEventType);
        ResultSet rs = ps.executeQuery();
        Integer result = rs.next() ? rs.getInt("id_task") : null;
        rs.close(); ps.close();
        return result;
    }

    // Igual a groupBedsHierarchy() de user_helpers.jsp, mas SEM o rótulo de fallback "Leito <id>".
    // No Saumar, leitos sem nome próprio aparecem em branco (o campo "bed" às vezes é só um espaço) —
    // aqui replicamos esse mesmo comportamento em vez de inventar um nome que não existe na base.
    private static JsonArray groupBedsHierarchyExact(ResultSet rs) throws SQLException {
        LinkedHashMap<String, LinkedHashMap<String, LinkedHashMap<String, JsonArray>>> tree =
            new LinkedHashMap<String, LinkedHashMap<String, LinkedHashMap<String, JsonArray>>>();

        while (rs.next()) {
            String building = rs.getString("building");
            String wing = rs.getString("wing");
            String room = rs.getString("room");
            int idBed = rs.getInt("id_bed");
            String bed = rs.getString("bed");

            LinkedHashMap<String, LinkedHashMap<String, JsonArray>> wings = tree.get(building);
            if (wings == null) {
                wings = new LinkedHashMap<String, LinkedHashMap<String, JsonArray>>();
                tree.put(building, wings);
            }
            LinkedHashMap<String, JsonArray> rooms = wings.get(wing);
            if (rooms == null) {
                rooms = new LinkedHashMap<String, JsonArray>();
                wings.put(wing, rooms);
            }
            JsonArray items = rooms.get(room);
            if (items == null) {
                items = new JsonArray();
                rooms.put(room, items);
            }

            JsonObject item = new JsonObject();
            item.addProperty("id", idBed);
            item.addProperty("label", bed != null ? bed : "");
            items.add(item);
        }

        JsonArray result = new JsonArray();
        for (Map.Entry<String, LinkedHashMap<String, LinkedHashMap<String, JsonArray>>> alaEntry : tree.entrySet()) {
            JsonObject ala = new JsonObject();
            ala.addProperty("group", alaEntry.getKey());
            JsonArray andares = new JsonArray();
            for (Map.Entry<String, LinkedHashMap<String, JsonArray>> andarEntry : alaEntry.getValue().entrySet()) {
                JsonObject andar = new JsonObject();
                andar.addProperty("group", andarEntry.getKey());
                JsonArray quartos = new JsonArray();
                for (Map.Entry<String, JsonArray> quartoEntry : andarEntry.getValue().entrySet()) {
                    JsonObject quarto = new JsonObject();
                    quarto.addProperty("group", quartoEntry.getKey());
                    quarto.add("items", quartoEntry.getValue());
                    quartos.add(quarto);
                }
                andar.add("subgroups", quartos);
                andares.add(andar);
            }
            ala.add("subgroups", andares);
            result.add(ala);
        }
        return result;
    }
%>
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

    String method = request.getMethod();
    Connection conn = null;

    try {
        conn = getConnection(application);

        if ("GET".equalsIgnoreCase(method)) {
            JsonObject result = new JsonObject();

            // Tipos de evento, agrupados por categoria, com cor/fundo para os badges.
            Statement stEvt = conn.createStatement();
            ResultSet rsEvt = stEvt.executeQuery(
                "SELECT e.id_event_type, e.event_type, e.color, e.background, " +
                "COALESCE(c.event_category, 'Sem Categoria') AS event_category " +
                "FROM event_types e LEFT JOIN event_categories c ON e.id_event_category = c.id_event_category " +
                "ORDER BY event_category ASC, e.event_type ASC");
            result.add("eventTypes", groupEventTypesWithColor(rsEvt));
            rsEvt.close(); stEvt.close();

            // Tarefas cadastradas (lista plana para o seletor).
            Statement stTask = conn.createStatement();
            ResultSet rsTask = stTask.executeQuery("SELECT id_task, task FROM tasks ORDER BY task ASC");
            JsonArray tasks = new JsonArray();
            while (rsTask.next()) {
                JsonObject t = new JsonObject();
                t.addProperty("id", rsTask.getInt("id_task"));
                t.addProperty("task", rsTask.getString("task"));
                tasks.add(t);
            }
            rsTask.close(); stTask.close();
            result.add("tasks", tasks);

            // Leitos, agrupados em 3 níveis: Ala (building) > Andar (wing) > Quarto (room).
            Statement stBeds = conn.createStatement();
            ResultSet rsBeds = stBeds.executeQuery(
                "SELECT b.id_bed, b.bed, r.room, " +
                "COALESCE(w.wing, 'Sem Andar') AS wing, COALESCE(bld.building, 'Sem Ala') AS building " +
                "FROM beds b JOIN rooms r ON b.id_room = r.id_room " +
                "LEFT JOIN wings w ON r.id_wing = w.id_wing " +
                "LEFT JOIN buildings bld ON w.id_building = bld.id_building " +
                "ORDER BY building ASC, wing ASC, r.room ASC, b.bed ASC");
            result.add("beds", groupBedsHierarchyExact(rsBeds));
            rsBeds.close(); stBeds.close();

            // Associações leito x evento x tarefa já existentes (para a grade de gestão).
            Statement stAssoc = conn.createStatement();
            ResultSet rsAssoc = stAssoc.executeQuery(
                "SELECT bet.id_bed, b.bed, r.room, " +
                "COALESCE(w.wing, 'Sem Andar') AS wing, COALESCE(bld.building, 'Sem Ala') AS building, " +
                "bet.id_event_type, e.event_type, e.color, e.background, " +
                "bet.id_task, t.task " +
                "FROM bed_event_tasks bet " +
                "JOIN beds b ON b.id_bed = bet.id_bed " +
                "JOIN rooms r ON b.id_room = r.id_room " +
                "LEFT JOIN wings w ON r.id_wing = w.id_wing " +
                "LEFT JOIN buildings bld ON w.id_building = bld.id_building " +
                "JOIN event_types e ON e.id_event_type = bet.id_event_type " +
                "JOIN tasks t ON t.id_task = bet.id_task " +
                "ORDER BY building ASC, wing ASC, r.room ASC, b.bed ASC, e.event_type ASC");
            JsonArray associations = new JsonArray();
            while (rsAssoc.next()) {
                JsonObject a = new JsonObject();
                a.addProperty("idBed", rsAssoc.getInt("id_bed"));
                a.addProperty("bed", rsAssoc.getString("bed"));
                a.addProperty("room", rsAssoc.getString("room"));
                a.addProperty("wing", rsAssoc.getString("wing"));
                a.addProperty("building", rsAssoc.getString("building"));
                a.addProperty("idEventType", rsAssoc.getInt("id_event_type"));
                a.addProperty("eventType", rsAssoc.getString("event_type"));
                a.addProperty("color", rsAssoc.getString("color"));
                a.addProperty("background", rsAssoc.getString("background"));
                a.addProperty("idTask", rsAssoc.getInt("id_task"));
                a.addProperty("task", rsAssoc.getString("task"));
                associations.add(a);
            }
            rsAssoc.close(); stAssoc.close();
            result.add("associations", associations);

            out.print(result.toString());

        } else if ("POST".equalsIgnoreCase(method)) {
            BufferedReader reader = request.getReader();
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }

            JsonParser parser = new JsonParser();
            JsonObject data = parser.parse(sb.toString().trim()).getAsJsonObject();
            String action = data.has("action") ? data.get("action").getAsString() : "";

            if ("preview".equals(action)) {
                // Verifica, sem gravar nada, quais leitos selecionados já têm este MESMO evento
                // associado a uma tarefa DIFERENTE da escolhida (conflito que exige confirmação).
                int idEventType = data.get("idEventType").getAsInt();
                int idTask = data.get("idTask").getAsInt();
                List<Integer> bedIds = jsonArrayToIntList(data.getAsJsonArray("bedIds"));

                JsonArray conflicts = new JsonArray();
                int newCount = 0;
                int sameCount = 0;

                for (Integer idBed : bedIds) {
                    Integer current = findCurrentTask(conn, idBed, idEventType);
                    if (current == null) {
                        newCount++;
                    } else if (current.intValue() == idTask) {
                        sameCount++;
                    } else {
                        PreparedStatement psBed = conn.prepareStatement(
                            "SELECT b.bed, r.room, COALESCE(w.wing,'Sem Andar') AS wing, COALESCE(bld.building,'Sem Ala') AS building, t.task AS current_task " +
                            "FROM beds b JOIN rooms r ON b.id_room = r.id_room " +
                            "LEFT JOIN wings w ON r.id_wing = w.id_wing " +
                            "LEFT JOIN buildings bld ON w.id_building = bld.id_building " +
                            "JOIN tasks t ON t.id_task = ? WHERE b.id_bed = ?");
                        psBed.setInt(1, current);
                        psBed.setInt(2, idBed);
                        ResultSet rsBed = psBed.executeQuery();
                        if (rsBed.next()) {
                            JsonObject c = new JsonObject();
                            c.addProperty("idBed", idBed);
                            c.addProperty("bed", rsBed.getString("bed"));
                            c.addProperty("room", rsBed.getString("room"));
                            c.addProperty("wing", rsBed.getString("wing"));
                            c.addProperty("building", rsBed.getString("building"));
                            c.addProperty("currentIdTask", current);
                            c.addProperty("currentTask", rsBed.getString("current_task"));
                            conflicts.add(c);
                        }
                        rsBed.close(); psBed.close();
                    }
                }

                JsonObject res = new JsonObject();
                res.addProperty("newCount", newCount);
                res.addProperty("sameCount", sameCount);
                res.add("conflicts", conflicts);
                out.print(res.toString());

            } else if ("apply".equals(action)) {
                // Aplica o evento+tarefa escolhido aos leitos selecionados, SEM tocar em nenhum outro
                // evento já configurado nesses leitos (upsert restrito ao par id_bed + id_event_type).
                int idEventType = data.get("idEventType").getAsInt();
                int idTask = data.get("idTask").getAsInt();
                List<Integer> bedIds = jsonArrayToIntList(data.getAsJsonArray("bedIds"));
                Set<Integer> overwriteBedIds = new HashSet<Integer>(
                    jsonArrayToIntList(data.has("overwriteBedIds") ? data.getAsJsonArray("overwriteBedIds") : null));

                int created = 0, updated = 0, skipped = 0;

                conn.setAutoCommit(false);
                try {
                    for (Integer idBed : bedIds) {
                        Integer current = findCurrentTask(conn, idBed, idEventType);

                        if (current == null) {
                            PreparedStatement ps = conn.prepareStatement(
                                "INSERT INTO bed_event_tasks (id_bed, id_event_type, id_task) VALUES (?,?,?)");
                            ps.setInt(1, idBed);
                            ps.setInt(2, idEventType);
                            ps.setInt(3, idTask);
                            ps.executeUpdate();
                            ps.close();
                            created++;
                        } else if (current.intValue() == idTask) {
                            // já está correto, nada a fazer
                        } else if (overwriteBedIds.contains(idBed)) {
                            PreparedStatement ps = conn.prepareStatement(
                                "UPDATE bed_event_tasks SET id_task = ? WHERE id_bed = ? AND id_event_type = ?");
                            ps.setInt(1, idTask);
                            ps.setInt(2, idBed);
                            ps.setInt(3, idEventType);
                            ps.executeUpdate();
                            ps.close();
                            updated++;
                        } else {
                            skipped++;
                        }
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
                res.addProperty("created", created);
                res.addProperty("updated", updated);
                res.addProperty("skipped", skipped);
                res.addProperty("message", "Aplicado com sucesso! " + created + " leito(s) novo(s), " + updated +
                    " atualizado(s)" + (skipped > 0 ? ", " + skipped + " ignorado(s) por conflito não confirmado." : "."));
                out.print(res.toString());

            } else if ("update_association".equals(action)) {
                // Edição direta de uma linha da grade (o admin já está olhando para aquele leito/evento específico,
                // então aqui o upsert pode sobrescrever sem necessidade de tela de conflito).
                int idBed = data.get("idBed").getAsInt();
                int idEventType = data.get("idEventType").getAsInt();
                int idTask = data.get("idTask").getAsInt();

                PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO bed_event_tasks (id_bed, id_event_type, id_task) VALUES (?,?,?) " +
                    "ON DUPLICATE KEY UPDATE id_task = ?");
                ps.setInt(1, idBed);
                ps.setInt(2, idEventType);
                ps.setInt(3, idTask);
                ps.setInt(4, idTask);
                ps.executeUpdate();
                ps.close();

                out.print("{\"success\":true, \"message\":\"Associação atualizada com sucesso!\"}");

            } else if ("delete_association".equals(action)) {
                int idBed = data.get("idBed").getAsInt();
                int idEventType = data.get("idEventType").getAsInt();

                PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM bed_event_tasks WHERE id_bed = ? AND id_event_type = ?");
                ps.setInt(1, idBed);
                ps.setInt(2, idEventType);
                int rows = ps.executeUpdate();
                ps.close();

                if (rows == 0) {
                    response.setStatus(404);
                    out.print("{\"error\":\"Associação não localizada para exclusão.\"}");
                    return;
                }

                out.print("{\"success\":true, \"message\":\"Associação removida com sucesso!\"}");

            } else {
                response.setStatus(400);
                out.print("{\"error\":\"Ação não reconhecida.\"}");
            }
        }
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
