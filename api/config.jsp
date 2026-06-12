<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%@ page import="java.sql.*, java.io.*, java.util.Properties" %>
<%@ page import="com.google.gson.*" %>
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
    String path = application.getRealPath("/WEB-INF/db_config.properties");
    File file = new File(path);

    if ("GET".equalsIgnoreCase(method)) {
        Properties props = new Properties();
        if (file.exists()) {
            InputStream in = null;
            try {
                in = new FileInputStream(file);
                props.load(in);
            } finally {
                if (in != null) {
                    try { in.close(); } catch (Exception e) {}
                }
            }
        } else {
            props.setProperty("db.host", "localhost");
            props.setProperty("db.port", "3306");
            props.setProperty("db.user", "root");
            props.setProperty("db.pass", "1@multitone");
            props.setProperty("db.name", "multitone_server");
        }

        JsonObject res = new JsonObject();
        res.addProperty("host", props.getProperty("db.host"));
        res.addProperty("port", props.getProperty("db.port"));
        res.addProperty("user", props.getProperty("db.user"));
        res.addProperty("pass", props.getProperty("db.pass"));
        res.addProperty("name", props.getProperty("db.name"));
        out.print(res.toString());

    } else if ("POST".equalsIgnoreCase(method)) {
        try {
            BufferedReader reader = request.getReader();
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }

            JsonParser parser = new JsonParser();
            JsonObject data = parser.parse(sb.toString().trim()).getAsJsonObject();
            String action = data.has("action") ? data.get("action").getAsString() : "save";

            String host = data.has("host") ? data.get("host").getAsString().trim() : "localhost";
            String port = data.has("port") ? data.get("port").getAsString().trim() : "3306";
            String user = data.has("user") ? data.get("user").getAsString().trim() : "root";
            String pass = data.has("pass") ? data.get("pass").getAsString().trim() : "";
            String name = data.has("name") ? data.get("name").getAsString().trim() : "multitone_server";

            if ("test".equals(action)) {
                Connection testConn = null;
                try {
                    Class.forName("com.mysql.jdbc.Driver");
                    testConn = DriverManager.getConnection(
                        "jdbc:mysql://" + host + ":" + port + "/" + name +
                        "?useSSL=false&allowPublicKeyRetrieval=true&connectTimeout=5000&socketTimeout=5000",
                        user, pass
                    );
                    out.print("{\"success\":true, \"message\":\"Conexão realizada com sucesso!\"}");
                } catch (Exception ex) {
                    response.setStatus(400);
                    String msg = ex.getMessage() != null ? ex.getMessage() : "Erro de conexão";
                    out.print("{\"error\":\"Falha ao conectar: " + msg.replace("\"", "\\\"") + "\"}");
                } finally {
                    if (testConn != null) {
                        try { testConn.close(); } catch (Exception e) {}
                    }
                }
            } else {
                // Save settings
                Properties props = new Properties();
                props.setProperty("db.host", host);
                props.setProperty("db.port", port);
                props.setProperty("db.user", user);
                props.setProperty("db.pass", pass);
                props.setProperty("db.name", name);

                file.getParentFile().mkdirs();
                OutputStream outStream = null;
                try {
                    outStream = new FileOutputStream(file);
                    props.store(outStream, "Updated Database Connection Settings");
                } finally {
                    if (outStream != null) {
                        try { outStream.close(); } catch (Exception e) {}
                    }
                }

                out.print("{\"success\":true, \"message\":\"Configurações de banco salvas com sucesso!\"}");
            }
        } catch (Exception e) {
            response.setStatus(500);
            String err = e.getMessage() != null ? e.getMessage() : "Erro interno";
            out.print("{\"error\":\"" + err.replace("\"", "\\\"") + "\"}");
        }
    }
%>
