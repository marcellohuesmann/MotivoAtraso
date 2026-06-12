<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%@ page import="java.io.*" %>
<%@ page import="com.google.gson.*" %>
<%@ page import="java.security.MessageDigest" %>
<%!
    private String sha256(String base) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(base.getBytes("UTF-8"));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }
%>
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

        String targetHash = "53c664e3365f1967583573eff7207181d87a769a012d4a4a0bffcd4412665dcd";
        String inputHash = sha256(password);

        if ("admin".equals(username) && targetHash.equals(inputHash)) {
            session.setAttribute("authenticated", true);
            session.setAttribute("username", "admin");
            
            JsonObject res = new JsonObject();
            res.addProperty("success", true);
            res.addProperty("message", "Login realizado com sucesso!");
            out.print(res.toString());
        } else {
            response.setStatus(401);
            out.print("{\"error\":\"Usuário ou senha incorretos.\"}");
        }
    } catch (Exception e) {
        response.setStatus(500);
        String err = e.getMessage() != null ? e.getMessage() : "Erro interno no servidor";
        out.print("{\"error\":\"" + err.replace("\"", "\\\"") + "\"}");
    }
%>
