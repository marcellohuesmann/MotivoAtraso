<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%@ page import="java.io.*, java.sql.*" %>
<%@ page import="com.google.gson.*" %>
<%@ include file="mg_auth_db.jsp" %>
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

    try {
        BufferedReader reader = request.getReader();
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line);
        }

        JsonParser parser = new JsonParser();
        JsonObject data = parser.parse(sb.toString().trim()).getAsJsonObject();

        String currentPassword = data.has("currentPassword") ? data.get("currentPassword").getAsString() : "";
        String newPassword = data.has("newPassword") ? data.get("newPassword").getAsString() : "";
        String username = (String) session.getAttribute("username");

        if (newPassword.length() < 6) {
            response.setStatus(400);
            out.print("{\"error\":\"A nova senha deve ter pelo menos 6 caracteres.\"}");
            return;
        }

        Connection conn = null;
        try {
            conn = getMgConnection(application);

            PreparedStatement ps = conn.prepareStatement("SELECT password_hash FROM mg_users WHERE login = ?");
            ps.setString(1, username);
            ResultSet rs = ps.executeQuery();

            if (!rs.next() || !sha256Hex(currentPassword).equals(rs.getString("password_hash"))) {
                rs.close();
                ps.close();
                response.setStatus(400);
                out.print("{\"error\":\"Senha atual incorreta.\"}");
                return;
            }
            rs.close();
            ps.close();

            PreparedStatement upd = conn.prepareStatement(
                "UPDATE mg_users SET password_hash = ?, must_change_password = 0 WHERE login = ?");
            upd.setString(1, sha256Hex(newPassword));
            upd.setString(2, username);
            upd.executeUpdate();
            upd.close();

            session.setAttribute("mustChangePassword", false);
            out.print("{\"success\":true,\"message\":\"Senha alterada com sucesso!\"}");
        } finally {
            if (conn != null) { try { conn.close(); } catch (Exception e) {} }
        }
    } catch (Exception e) {
        response.setStatus(500);
        String err = e.getMessage() != null ? e.getMessage() : "Erro interno no servidor";
        out.print("{\"error\":\"" + err.replace("\"", "\\\"") + "\"}");
    }
%>
