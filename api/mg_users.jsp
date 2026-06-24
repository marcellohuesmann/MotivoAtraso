<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%@ page import="java.sql.*, java.io.*" %>
<%@ page import="com.google.gson.*" %>
<%@ include file="mg_auth_db.jsp" %>
<%
    // CRUD dos usuários que acessam esta ferramenta (Multi Gerenciador), tabela multitone_mg.mg_users.
    // Não confundir com api/users.jsp, que gerencia os usuários da PLATAFORMA Multitone (multitone_server.users).
    request.setCharacterEncoding("UTF-8");
    response.setCharacterEncoding("UTF-8");
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    Boolean auth = (Boolean) session.getAttribute("authenticated");
    if (auth == null || !auth) {
        response.setStatus(401);
        out.print("{\"error\":\"Acesso não autorizado.\"}");
        return;
    }

    String currentUsername = (String) session.getAttribute("username");
    String method = request.getMethod();
    Connection conn = null;

    try {
        ensureMgDatabase(application);
        conn = getMgConnection(application);

        if ("GET".equalsIgnoreCase(method)) {
            Statement st = conn.createStatement();
            ResultSet rs = st.executeQuery(
                "SELECT id_mg_user, login, nome, must_change_password, created_at FROM mg_users ORDER BY login ASC");
            JsonArray arr = new JsonArray();
            while (rs.next()) {
                JsonObject u = new JsonObject();
                u.addProperty("id", rs.getInt("id_mg_user"));
                u.addProperty("login", rs.getString("login"));
                u.addProperty("nome", rs.getString("nome"));
                u.addProperty("mustChangePassword", rs.getInt("must_change_password") == 1);
                u.addProperty("createdAt", rs.getTimestamp("created_at").toString());
                u.addProperty("isSelf", rs.getString("login").equals(currentUsername));
                arr.add(u);
            }
            rs.close(); st.close();
            out.print(arr.toString());

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

            if ("create".equals(action)) {
                String login = data.has("login") ? data.get("login").getAsString().trim() : "";
                String nome = data.has("nome") ? data.get("nome").getAsString().trim() : "";
                String password = data.has("password") ? data.get("password").getAsString() : "";
                boolean mustChange = !data.has("mustChangePassword") || data.get("mustChangePassword").getAsBoolean();

                if (login.isEmpty()) {
                    response.setStatus(400);
                    out.print("{\"error\":\"O login é obrigatório.\"}");
                    return;
                }
                if (nome.isEmpty()) {
                    response.setStatus(400);
                    out.print("{\"error\":\"O nome do usuário é obrigatório.\"}");
                    return;
                }
                if (password.length() < 6) {
                    response.setStatus(400);
                    out.print("{\"error\":\"A senha deve ter pelo menos 6 caracteres.\"}");
                    return;
                }

                PreparedStatement psCheck = conn.prepareStatement("SELECT id_mg_user FROM mg_users WHERE login = ?");
                psCheck.setString(1, login);
                ResultSet rsCheck = psCheck.executeQuery();
                boolean exists = rsCheck.next();
                rsCheck.close(); psCheck.close();

                if (exists) {
                    response.setStatus(400);
                    out.print("{\"error\":\"Já existe um usuário com este login.\"}");
                    return;
                }

                PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO mg_users (login, nome, password_hash, must_change_password) VALUES (?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
                );
                ps.setString(1, login);
                ps.setString(2, nome);
                ps.setString(3, sha256Hex(password));
                ps.setInt(4, mustChange ? 1 : 0);
                ps.executeUpdate();

                ResultSet generatedKeys = ps.getGeneratedKeys();
                int generatedId = -1;
                if (generatedKeys.next()) {
                    generatedId = generatedKeys.getInt(1);
                }
                generatedKeys.close(); ps.close();

                JsonObject res = new JsonObject();
                res.addProperty("success", true);
                res.addProperty("id", generatedId);
                res.addProperty("message", "Usuário cadastrado com sucesso!");
                out.print(res.toString());

            } else if ("update".equals(action)) {
                int id = data.get("id").getAsInt();
                String login = data.has("login") ? data.get("login").getAsString().trim() : "";
                String nome = data.has("nome") ? data.get("nome").getAsString().trim() : "";
                String password = data.has("password") ? data.get("password").getAsString() : "";
                boolean mustChange = data.has("mustChangePassword") && data.get("mustChangePassword").getAsBoolean();

                if (login.isEmpty()) {
                    response.setStatus(400);
                    out.print("{\"error\":\"O login é obrigatório.\"}");
                    return;
                }
                if (nome.isEmpty()) {
                    response.setStatus(400);
                    out.print("{\"error\":\"O nome do usuário é obrigatório.\"}");
                    return;
                }
                if (!password.isEmpty() && password.length() < 6) {
                    response.setStatus(400);
                    out.print("{\"error\":\"A nova senha deve ter pelo menos 6 caracteres.\"}");
                    return;
                }

                PreparedStatement psCheck = conn.prepareStatement(
                    "SELECT id_mg_user FROM mg_users WHERE login = ? AND id_mg_user != ?");
                psCheck.setString(1, login);
                psCheck.setInt(2, id);
                ResultSet rsCheck = psCheck.executeQuery();
                boolean exists = rsCheck.next();
                rsCheck.close(); psCheck.close();

                if (exists) {
                    response.setStatus(400);
                    out.print("{\"error\":\"Já existe outro usuário com este login.\"}");
                    return;
                }

                int rows;
                if (!password.isEmpty()) {
                    PreparedStatement ps = conn.prepareStatement(
                        "UPDATE mg_users SET login = ?, nome = ?, password_hash = ?, must_change_password = ? WHERE id_mg_user = ?");
                    ps.setString(1, login);
                    ps.setString(2, nome);
                    ps.setString(3, sha256Hex(password));
                    ps.setInt(4, mustChange ? 1 : 0);
                    ps.setInt(5, id);
                    rows = ps.executeUpdate();
                    ps.close();
                } else {
                    PreparedStatement ps = conn.prepareStatement(
                        "UPDATE mg_users SET login = ?, nome = ?, must_change_password = ? WHERE id_mg_user = ?");
                    ps.setString(1, login);
                    ps.setString(2, nome);
                    ps.setInt(3, mustChange ? 1 : 0);
                    ps.setInt(4, id);
                    rows = ps.executeUpdate();
                    ps.close();
                }

                if (rows == 0) {
                    response.setStatus(404);
                    out.print("{\"error\":\"Usuário não localizado para atualização.\"}");
                    return;
                }

                JsonObject res = new JsonObject();
                res.addProperty("success", true);
                res.addProperty("message", "Usuário atualizado com sucesso!");
                out.print(res.toString());

            } else if ("delete".equals(action)) {
                int id = data.get("id").getAsInt();

                PreparedStatement psSelf = conn.prepareStatement("SELECT login FROM mg_users WHERE id_mg_user = ?");
                psSelf.setInt(1, id);
                ResultSet rsSelf = psSelf.executeQuery();
                String targetLogin = rsSelf.next() ? rsSelf.getString("login") : null;
                rsSelf.close(); psSelf.close();

                if (targetLogin == null) {
                    response.setStatus(404);
                    out.print("{\"error\":\"Usuário não localizado para exclusão.\"}");
                    return;
                }

                if (targetLogin.equals(currentUsername)) {
                    response.setStatus(400);
                    out.print("{\"error\":\"Você não pode excluir o próprio usuário enquanto estiver logado com ele.\"}");
                    return;
                }

                Statement stCount = conn.createStatement();
                ResultSet rsCount = stCount.executeQuery("SELECT COUNT(*) AS total FROM mg_users");
                rsCount.next();
                int total = rsCount.getInt("total");
                rsCount.close(); stCount.close();

                if (total <= 1) {
                    response.setStatus(400);
                    out.print("{\"error\":\"Não é possível excluir o último usuário cadastrado.\"}");
                    return;
                }

                PreparedStatement ps = conn.prepareStatement("DELETE FROM mg_users WHERE id_mg_user = ?");
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
