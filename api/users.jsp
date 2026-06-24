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

    String method = request.getMethod();
    Connection conn = null;

    try {
        conn = getConnection(application);

        if ("GET".equalsIgnoreCase(method)) {
            String idParam = request.getParameter("id");

            if (idParam != null) {
                int id = Integer.parseInt(idParam);
                PreparedStatement ps = conn.prepareStatement(
                    "SELECT id_user, login, name, id_user_rights, ip_regexp, preferences FROM users WHERE id_user = ?");
                ps.setInt(1, id);
                ResultSet rs = ps.executeQuery();

                if (!rs.next()) {
                    rs.close(); ps.close();
                    response.setStatus(404);
                    out.print("{\"error\":\"Usuário não localizado.\"}");
                    return;
                }

                JsonObject u = new JsonObject();
                u.addProperty("id", rs.getInt("id_user"));
                u.addProperty("login", rs.getString("login"));
                u.addProperty("name", rs.getString("name"));
                u.addProperty("idUserRights", rs.getInt("id_user_rights"));
                u.addProperty("ipRegexp", rs.getString("ip_regexp"));
                u.addProperty("preferences", rs.getString("preferences"));
                rs.close(); ps.close();

                u.add("beds", intListToJsonArray(loadChildIds(conn, "user_beds", "id_bed", id)));
                u.add("eventTypes", intListToJsonArray(loadChildIds(conn, "user_event_types", "id_event_type", id)));
                u.add("staffGroups", intListToJsonArray(loadChildIds(conn, "user_staff_groups", "id_staff_group", id)));
                u.add("alarmTypes", intListToJsonArray(loadChildIds(conn, "user_alarm_types", "id_alarm_type", id)));

                out.print(u.toString());

            } else {
                Statement st = conn.createStatement();
                ResultSet rs = st.executeQuery(
                    "SELECT u.id_user, u.login, u.name, u.id_user_rights, ur.user_rights, u.ip_regexp, " +
                    "(SELECT COUNT(*) FROM user_beds WHERE id_user = u.id_user) AS beds_count, " +
                    "(SELECT COUNT(*) FROM user_event_types WHERE id_user = u.id_user) AS event_types_count, " +
                    "(SELECT COUNT(*) FROM user_staff_groups WHERE id_user = u.id_user) AS staff_groups_count, " +
                    "(SELECT COUNT(*) FROM user_alarm_types WHERE id_user = u.id_user) AS alarm_types_count " +
                    "FROM users u JOIN user_rights ur ON u.id_user_rights = ur.id_user_rights " +
                    "ORDER BY u.name ASC");

                JsonArray arr = new JsonArray();
                while (rs.next()) {
                    JsonObject u = new JsonObject();
                    u.addProperty("id", rs.getInt("id_user"));
                    u.addProperty("login", rs.getString("login"));
                    u.addProperty("name", rs.getString("name"));
                    u.addProperty("idUserRights", rs.getInt("id_user_rights"));
                    u.addProperty("userRights", rs.getString("user_rights"));
                    u.addProperty("ipRegexp", rs.getString("ip_regexp"));
                    u.addProperty("bedsCount", rs.getInt("beds_count"));
                    u.addProperty("eventTypesCount", rs.getInt("event_types_count"));
                    u.addProperty("staffGroupsCount", rs.getInt("staff_groups_count"));
                    u.addProperty("alarmTypesCount", rs.getInt("alarm_types_count"));
                    arr.add(u);
                }
                rs.close(); st.close();
                out.print(arr.toString());
            }

        } else if ("POST".equalsIgnoreCase(method)) {
            BufferedReader reader = request.getReader();
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }

            JsonParser parser = new JsonParser();
            JsonObject data = parser.parse(sb.toString().trim()).getAsJsonObject();
            String action = data.has("action") ? data.get("action").getAsString() : "create";

            if ("create".equals(action) || "update".equals(action)) {
                String login = data.has("login") ? data.get("login").getAsString().trim() : "";
                String name = data.has("name") ? data.get("name").getAsString().trim() : "";
                String password = data.has("password") && !data.get("password").isJsonNull() ? data.get("password").getAsString() : "";

                if (!data.has("idUserRights") || data.get("idUserRights").isJsonNull()) {
                    response.setStatus(400);
                    out.print("{\"error\":\"O campo Direitos é obrigatório.\"}");
                    return;
                }
                int idUserRights = data.get("idUserRights").getAsInt();

                String ipRegexp = data.has("ipRegexp") && !data.get("ipRegexp").isJsonNull() ? data.get("ipRegexp").getAsString().trim() : null;
                if (ipRegexp != null && ipRegexp.isEmpty()) ipRegexp = null;

                if (login.isEmpty() || name.isEmpty()) {
                    response.setStatus(400);
                    out.print("{\"error\":\"Login e Nome são obrigatórios.\"}");
                    return;
                }

                List<Integer> beds = jsonArrayToIntList(data.has("beds") ? data.getAsJsonArray("beds") : null);
                List<Integer> eventTypes = jsonArrayToIntList(data.has("eventTypes") ? data.getAsJsonArray("eventTypes") : null);
                List<Integer> staffGroups = jsonArrayToIntList(data.has("staffGroups") ? data.getAsJsonArray("staffGroups") : null);
                List<Integer> alarmTypes = jsonArrayToIntList(data.has("alarmTypes") ? data.getAsJsonArray("alarmTypes") : null);

                // O cliente só envia "preferences" quando o admin de fato altera esse campo no modal,
                // evitando sobrescrever preferências gravadas em paralelo pelo app desktop do Multitone.
                boolean preferencesProvided = data.has("preferences");
                String preferences = preferencesProvided && !data.get("preferences").isJsonNull() ? data.get("preferences").getAsString().trim() : null;
                if (preferences != null && preferences.isEmpty()) preferences = null;
                if (preferences != null) {
                    try {
                        new JsonParser().parse(preferences);
                    } catch (Exception badJson) {
                        response.setStatus(400);
                        out.print("{\"error\":\"O campo Preferências (JSON) contém um conteúdo inválido.\"}");
                        return;
                    }
                }

                if ("create".equals(action)) {
                    if (password.trim().isEmpty()) {
                        response.setStatus(400);
                        out.print("{\"error\":\"A senha é obrigatória para novos usuários.\"}");
                        return;
                    }

                    PreparedStatement psCheck = conn.prepareStatement("SELECT id_user FROM users WHERE login = ?");
                    psCheck.setString(1, login);
                    ResultSet rsCheck = psCheck.executeQuery();
                    boolean exists = rsCheck.next();
                    rsCheck.close(); psCheck.close();
                    if (exists) {
                        response.setStatus(400);
                        out.print("{\"error\":\"Já existe um usuário cadastrado com este login.\"}");
                        return;
                    }

                    conn.setAutoCommit(false);
                    try {
                        PreparedStatement ps = conn.prepareStatement(
                            "INSERT INTO users (login, md5_pwd, name, id_user_rights, ip_regexp) VALUES (?,?,?,?,?)",
                            Statement.RETURN_GENERATED_KEYS);
                        ps.setString(1, login);
                        ps.setString(2, md5Upper(password));
                        ps.setString(3, name);
                        ps.setInt(4, idUserRights);
                        ps.setString(5, ipRegexp);
                        ps.executeUpdate();

                        ResultSet keys = ps.getGeneratedKeys();
                        int newId = -1;
                        if (keys.next()) newId = keys.getInt(1);
                        keys.close(); ps.close();

                        replaceChildAssoc(conn, "user_beds", "id_bed", newId, beds);
                        replaceChildAssoc(conn, "user_event_types", "id_event_type", newId, eventTypes);
                        replaceChildAssoc(conn, "user_staff_groups", "id_staff_group", newId, staffGroups);
                        replaceChildAssoc(conn, "user_alarm_types", "id_alarm_type", newId, alarmTypes);

                        if (preferences != null) {
                            PreparedStatement psPref = conn.prepareStatement("UPDATE users SET preferences = ? WHERE id_user = ?");
                            psPref.setString(1, preferences);
                            psPref.setInt(2, newId);
                            psPref.executeUpdate();
                            psPref.close();
                        }

                        conn.commit();

                        JsonObject res = new JsonObject();
                        res.addProperty("success", true);
                        res.addProperty("id", newId);
                        res.addProperty("message", "Usuário cadastrado com sucesso!");
                        out.print(res.toString());
                    } catch (Exception ex) {
                        conn.rollback();
                        throw ex;
                    } finally {
                        conn.setAutoCommit(true);
                    }

                } else {
                    if (!data.has("id")) {
                        response.setStatus(400);
                        out.print("{\"error\":\"ID do usuário não informado.\"}");
                        return;
                    }
                    int id = data.get("id").getAsInt();

                    PreparedStatement psCheck = conn.prepareStatement("SELECT id_user FROM users WHERE login = ? AND id_user != ?");
                    psCheck.setString(1, login);
                    psCheck.setInt(2, id);
                    ResultSet rsCheck = psCheck.executeQuery();
                    boolean exists = rsCheck.next();
                    rsCheck.close(); psCheck.close();
                    if (exists) {
                        response.setStatus(400);
                        out.print("{\"error\":\"Já existe outro usuário cadastrado com este login.\"}");
                        return;
                    }

                    conn.setAutoCommit(false);
                    try {
                        PreparedStatement ps;
                        if (!password.trim().isEmpty()) {
                            ps = conn.prepareStatement(
                                "UPDATE users SET login=?, name=?, id_user_rights=?, ip_regexp=?, md5_pwd=? WHERE id_user=?");
                            ps.setString(1, login);
                            ps.setString(2, name);
                            ps.setInt(3, idUserRights);
                            ps.setString(4, ipRegexp);
                            ps.setString(5, md5Upper(password));
                            ps.setInt(6, id);
                        } else {
                            ps = conn.prepareStatement(
                                "UPDATE users SET login=?, name=?, id_user_rights=?, ip_regexp=? WHERE id_user=?");
                            ps.setString(1, login);
                            ps.setString(2, name);
                            ps.setInt(3, idUserRights);
                            ps.setString(4, ipRegexp);
                            ps.setInt(5, id);
                        }
                        int rows = ps.executeUpdate();
                        ps.close();

                        if (rows == 0) {
                            conn.rollback();
                            response.setStatus(404);
                            out.print("{\"error\":\"Usuário não localizado para atualização.\"}");
                            return;
                        }

                        replaceChildAssoc(conn, "user_beds", "id_bed", id, beds);
                        replaceChildAssoc(conn, "user_event_types", "id_event_type", id, eventTypes);
                        replaceChildAssoc(conn, "user_staff_groups", "id_staff_group", id, staffGroups);
                        replaceChildAssoc(conn, "user_alarm_types", "id_alarm_type", id, alarmTypes);

                        if (preferencesProvided) {
                            PreparedStatement psPref = conn.prepareStatement("UPDATE users SET preferences = ? WHERE id_user = ?");
                            psPref.setString(1, preferences);
                            psPref.setInt(2, id);
                            psPref.executeUpdate();
                            psPref.close();
                        }

                        conn.commit();

                        JsonObject res = new JsonObject();
                        res.addProperty("success", true);
                        res.addProperty("id", id);
                        res.addProperty("message", "Usuário atualizado com sucesso!");
                        out.print(res.toString());
                    } catch (Exception ex) {
                        conn.rollback();
                        throw ex;
                    } finally {
                        conn.setAutoCommit(true);
                    }
                }

            } else if ("delete".equals(action)) {
                int id = data.get("id").getAsInt();

                PreparedStatement ps = conn.prepareStatement("DELETE FROM users WHERE id_user = ?");
                ps.setInt(1, id);
                int rows = ps.executeUpdate();
                ps.close();

                if (rows == 0) {
                    response.setStatus(404);
                    out.print("{\"error\":\"Usuário não localizado para exclusão.\"}");
                    return;
                }

                out.print("{\"success\":true, \"message\":\"Usuário excluído com sucesso!\"}");
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
