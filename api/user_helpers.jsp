<%@ page import="java.sql.*, java.security.MessageDigest, java.util.*" %>
<%@ page import="com.google.gson.*" %>
<%!
    // Replica o hash usado pelo Multitone/Saumar: MD5 do texto em UTF-8, hexadecimal em MAIÚSCULAS.
    private static String md5Upper(String text) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("MD5");
        byte[] hash = digest.digest(text.getBytes("UTF-8"));
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) {
            String h = Integer.toHexString(0xff & b);
            if (h.length() == 1) hex.append('0');
            hex.append(h);
        }
        return hex.toString().toUpperCase();
    }

    private static List<Integer> jsonArrayToIntList(JsonArray arr) {
        List<Integer> list = new ArrayList<Integer>();
        if (arr == null) return list;
        for (JsonElement el : arr) {
            list.add(el.getAsInt());
        }
        return list;
    }

    private static JsonArray intListToJsonArray(List<Integer> list) {
        JsonArray arr = new JsonArray();
        for (Integer i : list) arr.add(new JsonPrimitive(i));
        return arr;
    }

    // Substitui totalmente as associações de uma tabela filha (padrão DELETE+INSERT usado pelo Multitone).
    private static void replaceChildAssoc(Connection conn, String table, String column, int idUser, List<Integer> ids) throws SQLException {
        PreparedStatement del = conn.prepareStatement("DELETE FROM " + table + " WHERE id_user = ?");
        del.setInt(1, idUser);
        del.executeUpdate();
        del.close();

        if (ids != null && !ids.isEmpty()) {
            PreparedStatement ins = conn.prepareStatement("INSERT INTO " + table + " (id_user, " + column + ") VALUES (?, ?)");
            for (Integer id : ids) {
                ins.setInt(1, idUser);
                ins.setInt(2, id);
                ins.addBatch();
            }
            ins.executeBatch();
            ins.close();
        }
    }

    private static List<Integer> loadChildIds(Connection conn, String table, String column, int idUser) throws SQLException {
        List<Integer> list = new ArrayList<Integer>();
        PreparedStatement ps = conn.prepareStatement("SELECT " + column + " FROM " + table + " WHERE id_user = ?");
        ps.setInt(1, idUser);
        ResultSet rs = ps.executeQuery();
        while (rs.next()) {
            list.add(rs.getInt(1));
        }
        rs.close(); ps.close();
        return list;
    }

    // Agrupa leitos em 3 níveis (Ala > Andar > Quarto), com os leitos como itens-folha de cada quarto.
    private static JsonArray groupBedsHierarchy(ResultSet rs) throws SQLException {
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
            item.addProperty("label", (bed != null && !bed.trim().isEmpty()) ? bed : ("Leito " + idBed));
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

    // Agrupa linhas de um ResultSet em {group, items:[{id,label}]}, na ordem em que aparecem (já ordenadas pela query).
    private static JsonArray groupRows(ResultSet rs, String groupCol, String idCol, String[] labelCols, String labelSep) throws SQLException {
        LinkedHashMap<String, JsonArray> groups = new LinkedHashMap<String, JsonArray>();
        while (rs.next()) {
            String groupName = rs.getString(groupCol);
            JsonArray items = groups.get(groupName);
            if (items == null) {
                items = new JsonArray();
                groups.put(groupName, items);
            }
            JsonObject item = new JsonObject();
            item.addProperty("id", rs.getInt(idCol));
            StringBuilder label = new StringBuilder();
            for (int i = 0; i < labelCols.length; i++) {
                if (i > 0) label.append(labelSep);
                label.append(rs.getString(labelCols[i]));
            }
            item.addProperty("label", label.toString());
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
%>
