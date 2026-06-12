<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    Boolean auth = (Boolean) session.getAttribute("authenticated");
    if (auth != null && auth) {
        out.print("{\"authenticated\":true}");
    } else {
        out.print("{\"authenticated\":false}");
    }
%>
