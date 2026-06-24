<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    Boolean auth = (Boolean) session.getAttribute("authenticated");
    Boolean mustChange = (Boolean) session.getAttribute("mustChangePassword");
    String username = (String) session.getAttribute("username");
    String nome = (String) session.getAttribute("nome");
    boolean mustChangeFlag = mustChange != null && mustChange;
    if (auth != null && auth) {
        String usernameJson = username != null ? username.replace("\"", "\\\"") : "";
        String nomeJson = nome != null ? nome.replace("\"", "\\\"") : "";
        out.print("{\"authenticated\":true,\"mustChangePassword\":" + mustChangeFlag + ",\"username\":\"" + usernameJson + "\",\"nome\":\"" + nomeJson + "\"}");
    } else {
        out.print("{\"authenticated\":false,\"mustChangePassword\":false}");
    }
%>
