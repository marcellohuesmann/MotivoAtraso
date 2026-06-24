<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%@ page import="java.io.*, java.sql.*" %>
<%@ page import="com.google.gson.*" %>
<%@ include file="mg_auth_db.jsp" %>
<%
    request.setCharacterEncoding("UTF-8");
    response.setCharacterEncoding("UTF-8");
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    String method = request.getMethod();
    if (!"POST".equalsIgnoreCase(method)) {
        response.setStatus(405);
        out.print("{\"error\":\"Método não permitido.\"}");
        return;
    }

    try {
        ensureMgDatabase(application);

        BufferedReader reader = request.getReader();
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line);
        }

        JsonParser parser = new JsonParser();
        JsonObject data = parser.parse(sb.toString().trim()).getAsJsonObject();

        String username = data.has("username") ? data.get("username").getAsString().trim() : "";
        String password = data.has("password") ? data.get("password").getAsString().trim() : "";
        String inputHash = sha256Hex(password);

        Connection conn = null;
        try {
            conn = getMgConnection(application);
            PreparedStatement ps = conn.prepareStatement(
                "SELECT nome, password_hash, must_change_password FROM mg_users WHERE login = ?");
            ps.setString(1, username);
            ResultSet rs = ps.executeQuery();

            if (rs.next() && inputHash.equals(rs.getString("password_hash"))) {
                String nome = rs.getString("nome");
                boolean mustChange = rs.getInt("must_change_password") == 1;
                rs.close();
                ps.close();

                session.setAttribute("authenticated", true);
                session.setAttribute("username", username);
                session.setAttribute("nome", nome);
                session.setAttribute("mustChangePassword", mustChange);

                JsonObject res = new JsonObject();
                res.addProperty("success", true);
                res.addProperty("message", "Login realizado com sucesso!");
                res.addProperty("mustChangePassword", mustChange);
                out.print(res.toString());
            } else {
                rs.close();
                ps.close();
                response.setStatus(401);
                out.print("{\"error\":\"Usuário ou senha incorretos.\"}");
            }
        } finally {
            if (conn != null) { try { conn.close(); } catch (Exception e) {} }
        }
    } catch (Exception e) {
        response.setStatus(500);
        String err = e.getMessage() != null ? e.getMessage() : "Erro interno no servidor";
        out.print("{\"error\":\"" + err.replace("\"", "\\\"") + "\"}");
    }
%>
