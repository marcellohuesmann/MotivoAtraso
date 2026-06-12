<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%@ page import="java.sql.*,java.io.*" %>
<%@ page import="com.google.gson.*" %>
<%@ include file="db_init.jsp" %>
<%
    request.setCharacterEncoding("UTF-8");
    response.setCharacterEncoding("UTF-8");
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    Boolean auth = (Boolean) session.getAttribute("authenticated");
    if (auth == null || !auth) {
        response.setStatus(401);
        out.print("{\"error\":\"Acesso não autorizado. Por favor, faça login.\"}");
        return;
    }

    String method = request.getMethod();
    Connection conn = null;

    try {
        conn = getConnection(application);

        if ("GET".equalsIgnoreCase(method)) {
            Statement st = conn.createStatement();
            ResultSet rs = st.executeQuery("SELECT id_patient_delay, patient_delay FROM patient_delays ORDER BY patient_delay ASC");
            JsonArray arr = new JsonArray();
            while (rs.next()) {
                JsonObject u = new JsonObject();
                u.addProperty("id", rs.getInt("id_patient_delay"));
                u.addProperty("patientDelay", rs.getString("patient_delay"));
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
                String val = data.has("patientDelay") ? data.get("patientDelay").getAsString().trim() : "";
                if (val.isEmpty()) {
                    response.setStatus(400);
                    out.print("{\"error\":\"A descrição do motivo é obrigatória.\"}");
                    return;
                }

                // Verificar duplicados
                PreparedStatement psCheck = conn.prepareStatement("SELECT id_patient_delay FROM patient_delays WHERE patient_delay = ?");
                psCheck.setString(1, val);
                ResultSet rsCheck = psCheck.executeQuery();
                boolean exists = rsCheck.next();
                rsCheck.close(); psCheck.close();

                if (exists) {
                    response.setStatus(400);
                    out.print("{\"error\":\"Este motivo de atraso já está cadastrado.\"}");
                    return;
                }

                PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO patient_delays (patient_delay) VALUES (?)",
                    Statement.RETURN_GENERATED_KEYS
                );
                ps.setString(1, val);
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
                res.addProperty("patientDelay", val);
                res.addProperty("message", "Motivo de atraso cadastrado com sucesso!");
                out.print(res.toString());

            } else if ("update".equals(action)) {
                int id = data.get("id").getAsInt();
                String val = data.has("patientDelay") ? data.get("patientDelay").getAsString().trim() : "";
                if (val.isEmpty()) {
                    response.setStatus(400);
                    out.print("{\"error\":\"A nova descrição do motivo é obrigatória.\"}");
                    return;
                }

                // Verificar duplicados para outro ID
                PreparedStatement psCheck = conn.prepareStatement("SELECT id_patient_delay FROM patient_delays WHERE patient_delay = ? AND id_patient_delay != ?");
                psCheck.setString(1, val);
                psCheck.setInt(2, id);
                ResultSet rsCheck = psCheck.executeQuery();
                boolean exists = rsCheck.next();
                rsCheck.close(); psCheck.close();

                if (exists) {
                    response.setStatus(400);
                    out.print("{\"error\":\"Já existe outro motivo de atraso com esta mesma descrição.\"}");
                    return;
                }

                PreparedStatement ps = conn.prepareStatement(
                    "UPDATE patient_delays SET patient_delay = ? WHERE id_patient_delay = ?"
                );
                ps.setString(1, val);
                ps.setInt(2, id);
                int rows = ps.executeUpdate();
                ps.close();

                if (rows == 0) {
                    response.setStatus(404);
                    out.print("{\"error\":\"Motivo de atraso não localizado para atualização.\"}");
                    return;
                }

                JsonObject res = new JsonObject();
                res.addProperty("success", true);
                res.addProperty("id", id);
                res.addProperty("patientDelay", val);
                res.addProperty("message", "Motivo de atraso atualizado com sucesso!");
                out.print(res.toString());

            } else if ("delete".equals(action)) {
                int id = data.get("id").getAsInt();

                // Verificar se está em uso na tabela 'surgeries'
                PreparedStatement psCheck = conn.prepareStatement("SELECT id_surgery FROM surgeries WHERE id_patient_delay = ? LIMIT 1");
                psCheck.setInt(1, id);
                ResultSet rsCheck = psCheck.executeQuery();
                boolean inUse = rsCheck.next();
                rsCheck.close(); psCheck.close();

                if (inUse) {
                    response.setStatus(400);
                    out.print("{\"error\":\"Este motivo não pode ser excluído porque está associado a cirurgias registradas no sistema.\"}");
                    return;
                }

                PreparedStatement ps = conn.prepareStatement("DELETE FROM patient_delays WHERE id_patient_delay = ?");
                ps.setInt(1, id);
                int rows = ps.executeUpdate();
                ps.close();

                if (rows == 0) {
                    response.setStatus(404);
                    out.print("{\"error\":\"Motivo de atraso não localizado para exclusão.\"}");
                    return;
                }

                out.print("{\"success\":true, \"message\":\"Motivo de atraso excluído com sucesso!\"}");
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
